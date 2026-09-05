# Architecture — Distributed Wagering Processor

Este documento descreve as decisões técnicas concretas da implementação. O enunciado completo do desafio permanece em `README.md`.

## Visão geral

Monólito modular NestJS + Bun, com boundaries claros:

- **Domain**: invariantes financeiras (`Money`, `Wallet`, `WagerTransaction`, ledger, inbox/outbox, eventos)
- **Application**: use cases, ports, serviços de orquestração
- **Infrastructure**: MikroORM/PostgreSQL, SQS (MiniStack), HTTP, observabilidade
- **Modules**: composição NestJS (`FinanceModule`, `MessagingModule`, `ApiModule`)

## Dinheiro e persistência

- Valores monetários usam `decimal.js` encapsulado em `Money` (imutável)
- PostgreSQL armazena `NUMERIC(19,2)` mapeado para `string` via `MoneyAmountType` (nunca `number`)
- Toda operação financeira valida moeda explicitamente

## Concorrência por wallet

**Unidade de serialização: `walletId`.**

| Operação | Estratégia |
|---|---|
| BET (débito) | `UPDATE wallets SET balance = balance - ? WHERE id = ? AND balance >= ? RETURNING` (atômico, sem lock explícito) |
| WIN (crédito) | `UPDATE ... balance + ? RETURNING` |
| REFUND/ROLLBACK | `SELECT ... FOR UPDATE` (PESSIMISTIC_WRITE) na wallet + validação da referência antes da mutação |
| Inbox/Outbox claim | `INSERT ON CONFLICT` / `FOR UPDATE SKIP LOCKED` |

**Justificativa:** o débito condicionado no PostgreSQL elimina lost updates no cenário mais crítico (hot wallet) sem segurar lock durante validações de negócio. Locks pessimistas ficam restritos a reversões, onde a ordem referência → mutação importa.

Recursos de ordenação/dedup do SQS FIFO são otimização; o banco é a fonte da verdade.

## Idempotência

- Header HTTP `Idempotency-Key` (ou campo equivalente na mensagem SQS) é a chave canônica
- Persistência: `INSERT INTO wager_transactions (...) ON CONFLICT (idempotency_key) DO NOTHING`
- `payloadHash` = SHA-256 de JSON canônico (chaves ordenadas) dos campos de negócio documentados em `buildWagerPayloadHashInput`
- Replay retorna `observed_balance` **persistido**, não o saldo atual da wallet
- Mesma key + payload diferente → `409 Conflict` (`IdempotencyConflictError`)

## Inbox (SQS)

- Dedup por `(consumer_name, message_id)` com `INSERT ... ON CONFLICT DO NOTHING`
- Inbox + processamento financeiro + outbox na **mesma transação SQL**
- Ack SQS somente após commit
- Redelivery: se inbox existe sem `processed_at`, reprocessa com idempotência financeira

## Transactional Outbox

- Eventos enfileirados na mesma TX da mutação financeira
- Publisher: `SELECT ... FOR UPDATE SKIP LOCKED` + publish SQS + `published_at` na mesma TX
- Falha de publish → `scheduleRetry()` com backoff exponencial
- Publicação duplicada é segura (consumidores devem ser idempotentes por `eventId`)

## Referências fora de ordem

- REFUND/ROLLBACK sem referência → `PENDING_REFERENCE`
- `ReprocessPendingReferenceWorker`: backoff exponencial (base 1s, máx 60s), até 10 tentativas
- Esgotado → `REJECTED` com `REFERENCE_NOT_FOUND`

## Autenticação

**Não implementada** (decisão consciente para priorizar correção financeira).

- `AuthGuard` no-op em rotas de negócio (`src/infrastructure/http/guards/auth.guard.ts`)
- Health (`/health/*`) e métricas (`/metrics`) ficam abertos
- Ponto de extensão: substituir `AuthGuard` por validação OIDC (Keycloak/Zitadel) sem alterar use cases

## API HTTP — mapeamento de status

| Situação | HTTP |
|---|---|
| Payload/header inválido | 400 |
| Wallet/transação não encontrada | 404 |
| Wallet duplicada / idempotency conflict | 409 |
| Rejeição de negócio (`REJECTED`) | 422 (corpo inclui `failureCode`) |
| Referência pendente (`PENDING_REFERENCE`) | 202 |
| Processado / replay idempotente | 200 |
| Readiness degradado | 503 em `/health/ready` |

## Observabilidade

- Logs JSON via interceptor (`correlationId`, `walletId`, `providerId`, duração; sem payloads financeiros completos)
- Métricas Prometheus em `/metrics`:
  - `wager_transactions_total{status,kind}`
  - `idempotency_duplicates_total`
  - `reconciliation_mismatch_total`
  - `dlq_messages_total`
  - `outbox_pending_messages`
  - `wager_processing_latency_seconds`

## Reconciliação

- `POST /wallets/:walletId/reconciliation` compara saldo materializado vs soma do ledger
- Divergências **não** são corrigidas automaticamente; são logadas, metricadas e retornadas na resposta

## Limitações conhecidas

- Mensageria SQS tratada como canal interno confiável (sem auth na fila)
- Reversão parcial fora de escopo
- Multi-moeda por player: uma wallet por `(playerId, currency)`
- Testes de integração/concorrência exigem PostgreSQL e MiniStack reais (sem mocks)

## Testes manuais da API (Postman)

Collection em `postman/wagering-processor.postman_collection.json` para validar a stack rodando via Docker Compose (`http://localhost:3000`).

Importe no Postman ou no Insomnia (formato Collection v2.1) e execute os requests **na ordem numérica** da pasta (01 → 12). O request **03 - Create Wallet** grava `walletId` na variável da collection; o **05 - BET** grava `transactionId`.

Variáveis padrão da collection:

| Variável | Valor inicial |
|---|---|
| `baseUrl` | `http://localhost:3000` |
| `playerId` | UUID fixo de exemplo |

Pré-requisito: `docker compose up` com `app`, `postgres` e `ministack` healthy. Migrations rodam no entrypoint do container `app`.

## Invariante de testes

Em todos os testes de integração e concorrência:

```
wallet.balance == saldo reconstruído pelo ledger
```
