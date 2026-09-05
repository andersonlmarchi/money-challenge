# Execução com Docker Compose

Este guia explica como subir a stack completa, validar a API manualmente e rodar os testes automatizados.

As decisões de arquitetura e as justificativas técnicas estão em [`ARCHITECTURE.md`](./ARCHITECTURE.md). O enunciado completo do desafio permanece em [`README.md`](./README.md).

## Pré-requisitos

- Docker e Docker Compose instalados
- [Bun 1.x](https://bun.sh) instalado na máquina host (necessário para rodar os testes localmente)
- Postman ou Insomnia (opcional, para executar a collection HTTP)

## Subir a stack

Na raiz do repositório, execute:

```bash
docker compose up --build
```

O Compose sobe três serviços:

| Serviço | Função | Porta no host |
|---|---|---|
| `postgres` | Banco PostgreSQL 16 | `5432` |
| `ministack` | Emulador AWS SQS (MiniStack) | `4566` |
| `app` | API NestJS e workers (consumer, outbox, pending-reference) | `3000` |

O container `app` só inicia depois que `postgres` e `ministack` passam no healthcheck.

### O que acontece no boot do container `app`

1. O entrypoint (`scripts/docker-entrypoint.sh`) executa `migration:up:prod` contra o PostgreSQL do serviço `postgres`.
2. A aplicação sobe com `NODE_ENV=production`, o que desliga os logs SQL do ORM.
3. Os workers de mensageria iniciam automaticamente, pois o `.env.example` define `MESSAGING_ENABLED=true`.

Para subir em background:

```bash
docker compose up --build -d
```

Para parar e remover os containers (o volume de dados do Postgres é preservado):

```bash
docker compose down
```

## Verificar se a stack está saudável

Com os serviços no ar:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

- **`/health/live`**: confirma que o processo Node responde. Retorna `200` enquanto a aplicação estiver de pé.
- **`/health/ready`**: verifica conexão com o PostgreSQL e acesso à fila SQS. Retorna `503` se algum desses checks falhar.

Para consultar as métricas expostas no formato Prometheus:

```bash
curl http://localhost:3000/metrics
```

## Testes manuais com Postman

Collection: [`postman/wagering-processor.postman_collection.json`](./postman/wagering-processor.postman_collection.json)

### Como importar

1. Abra o Postman ou o Insomnia.
2. Importe o arquivo JSON da collection.
3. Confirme que a variável `baseUrl` está definida como `http://localhost:3000`.

### Ordem de execução

Execute os requests na ordem, de 1 a 12. Alguns passos dependem de variáveis preenchidas pelos requests anteriores:

| Request | O que valida | Variáveis gravadas |
|---|---|---|
| 01 - Health Live | Processo vivo | — |
| 02 - Health Ready | Postgres e SQS acessíveis | — |
| 03 - Create Wallet | Criação de wallet com saldo inicial e transação OPENING | `walletId` |
| 04 - Get Wallet | Consulta de saldo | — |
| 05 - BET | Débito processado com sucesso | `transactionId` |
| 06 - BET Idempotent Replay | Replay com a mesma `Idempotency-Key` | — |
| 07 - BET Insufficient Balance | Rejeição 422 por saldo insuficiente | — |
| 08 - Wallet Ledger | Consulta paginada do ledger | — |
| 09 - Reconciliation | Consistência entre saldo materializado e ledger | — |
| 10 - Get Transaction by ID | Consulta por id interno | — |
| 11 - Get Transaction by External ID | Consulta por id externo do provedor | — |
| 12 - Metrics | Endpoint de métricas Prometheus | — |

O request **03** grava `walletId` automaticamente por meio de um script de teste da collection. O request **05** grava `transactionId` da mesma forma.

## Testes automatizados

Todos os testes são executados com `bun test`. O que muda entre os comandos é **quais suites entram na execução** e **se elas dependem de infraestrutura externa**.

### `bun test` (comando padrão)

```bash
bun test
```

Este comando roda **somente os testes unitários** de domínio, aplicação e tipos de infraestrutura. Não é necessário ter PostgreSQL nem SQS disponíveis.

Os testes de integração e de concorrência aparecem como **skipped**. Esse comportamento é intencional: alguém que acabou de clonar o repositório e roda `bun test` sem Docker não deve receber erro de conexão por falta de banco ou fila.

### Suites que exigem infraestrutura

Com o Docker Compose em execução, use os scripts dedicados:

| Script | O que executa | Variáveis de ambiente |
|---|---|---|
| `bun run test:integration` | Finance core e reversals (PostgreSQL) | `RUN_INTEGRATION_TESTS=true` |
| `bun run test:concurrency` | Cenários de corrida e multi-processo (PostgreSQL) | `RUN_INTEGRATION_TESTS=true` |
| `bun run test:messaging` | Inbox, outbox, consumer e DLQ (PostgreSQL + SQS) | `RUN_INTEGRATION_TESTS=true` e `RUN_MESSAGING_TESTS=true` |
| `bun run test:all` | Suite completa: unitários, integração, concorrência e messaging | ambas as variáveis |

Exemplo com a stack Docker rodando:

```bash
bun run test:all
```

Resultado esperado: **48 pass, 0 fail** (sem skips).

### Por que os testes estão separados?

1. **Feedback rápido no dia a dia:** `bun test` termina em poucos segundos e valida as regras de domínio sem depender de serviços externos.
2. **Opt-in explícito:** os testes de integração usam PostgreSQL real e truncam tabelas entre cenários. Os de messaging usam filas SQS reais. Executar essas suites sem a infraestrutura correta produz falhas difíceis de interpretar.
3. **Messaging como caso aparte:** além do Postgres, a suite de messaging exige MiniStack healthy e filas criadas. A flag `RUN_MESSAGING_TESTS` isola esse conjunto de testes.

As flags são lidas em `test/integration/setup.ts` e `test/integration/messaging-setup.ts`. Cada arquivo de integração usa `describe.skipIf(...)` quando a variável correspondente não está definida.

### Invariante verificada nos testes de integração

Nos testes de integração e concorrência, após cada cenário relevante, vale a seguinte invariante:

```
wallet.balance == saldo reconstruído pelo ledger
```

Essa verificação está implementada em `test/concurrency/helpers.ts`, na função `assertWalletLedgerInvariant`.

## Rodar testes a partir do host contra o Compose

Se ainda não tiver um `.env`, copie o exemplo:

```bash
cp .env.example .env
```

Os testes de integração rodam **na máquina host**, não dentro do container. Eles se conectam ao Postgres e ao MiniStack expostos pelo Compose.

## Desenvolvimento local sem Docker (opcional)

Esta seção não faz parte do fluxo principal de avaliação via Compose, mas pode ser útil:

```bash
bun install
cp .env.example .env
# Suba Postgres e MiniStack por conta própria, ou apenas as dependências via Compose:
# docker compose up postgres ministack -d
bun run migration:up
bun run start:dev
```

Para trabalhar só com a API HTTP, sem workers SQS, defina `MESSAGING_ENABLED=false` no `.env`.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `test:all` com muitos skips | Foi executado `bun test` em vez de `bun run test:all` | Use o script que habilita as variáveis de ambiente |
| Integração falha com `ECONNREFUSED` | Compose parado ou `.env` desatualizado | Suba o Compose com `docker compose up -d` e confira o `.env` |
| Suite de messaging falha | MiniStack ainda não passou no healthcheck | Aguarde o healthcheck ou consulte os logs do serviço `ministack` |
| Postman retorna 503 no ready | A aplicação subiu antes das dependências ficarem prontas | Aguarde os healthchecks ou reinicie o serviço `app` |
