import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import {
  FailureCode,
  LedgerDirection,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/enums/index.js';
import { DuplicateWalletError } from '../../domain/errors/index.js';
import { Money } from '../../domain/money/index.js';
import { WalletLedgerEntry } from '../../domain/ledger/index.js';
import { OutboxMessage } from '../../domain/outbox/index.js';
import { WagerTransaction } from '../../domain/wager-transaction/index.js';
import { Wallet } from '../../domain/wallet/index.js';
import {
  WalletBalanceChanged,
  WagerTransactionProcessed,
} from '../../domain/events/wagering-events.js';
import type { OpenWalletCommand, OpenWalletResult } from '../dtos/finance.dtos.js';
import {
  buildWagerPayloadHashInput,
  computePayloadHash,
} from '../utils/payload-hash.js';
import {
  FinanceGateway,
  isUniqueViolation,
} from '../../infrastructure/persistence/gateways/finance.gateway.js';
import { MikroOrmUnitOfWork } from '../../infrastructure/persistence/unit-of-work.js';

@Injectable()
export class OpenWalletUseCase {
  constructor(private readonly unitOfWork: MikroOrmUnitOfWork) {}

  async execute(command: OpenWalletCommand): Promise<OpenWalletResult> {
    const initialBalance = Money.from(command.initialBalance);
    const walletId = uuidv7();
    const now = new Date();

    return this.unitOfWork.transactional(async (em) => {
      const gateway = new FinanceGateway(em);

      const existing = await gateway.findWalletByPlayerAndCurrency(
        command.playerId,
        initialBalance.currency,
      );
      if (existing) {
        throw new DuplicateWalletError(
          `Wallet already exists for player ${command.playerId} and currency ${initialBalance.currency}`,
        );
      }

      const wallet = Wallet.open({
        id: walletId,
        playerId: command.playerId,
        initialBalance,
      });

      try {
        await gateway.saveWallet(wallet);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new DuplicateWalletError(
            `Wallet already exists for player ${command.playerId} and currency ${initialBalance.currency}`,
          );
        }
        throw error;
      }

      if (initialBalance.isPositive()) {
        await this.processOpeningCredit(gateway, wallet, initialBalance, now);
      }

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }

  private async processOpeningCredit(
    gateway: FinanceGateway,
    wallet: Wallet,
    amount: Money,
    now: Date,
  ): Promise<void> {
    const transactionId = uuidv7();
    const payloadHash = computePayloadHash({
      walletId: wallet.id,
      playerId: wallet.playerId,
      kind: WagerTransactionKind.Opening,
      money: amount.toJSON(),
    });

    const opening = WagerTransaction.createOpening({
      id: transactionId,
      walletId: wallet.id,
      playerId: wallet.playerId,
      money: amount,
      idempotencyKey: `opening:${wallet.id}`,
      payloadHash,
      createdAt: now,
    });

    const insertResult = await gateway.insertWagerTransactionOrConflict(opening);
    if (insertResult === 'conflict') {
      return;
    }

    opening.markProcessed(undefined, wallet.balance, now);
    await gateway.updateWagerTransaction(opening);

    const ledgerEntry = WalletLedgerEntry.create({
      id: uuidv7(),
      walletId: wallet.id,
      transactionId: opening.id,
      direction: LedgerDirection.Credit,
      money: amount,
      balanceBefore: Money.zero(amount.currency),
      balanceAfter: amount,
      createdAt: now,
    });
    await gateway.insertLedgerEntry(ledgerEntry);

    await this.enqueueBalanceChanged(gateway, wallet, opening, ledgerEntry, opening.id, now);
    await gateway.insertOutbox(
      OutboxMessage.enqueue(
        WagerTransactionProcessed.create({
          eventId: uuidv7(),
          aggregateId: wallet.id,
          correlationId: opening.id,
          occurredAt: now,
          data: {
            transactionId: opening.id,
            walletId: wallet.id,
            kind: opening.kind,
            status: opening.status,
            observedBalance: opening.observedBalance?.toJSON(),
          },
        }),
      ),
    );
  }

  private async enqueueBalanceChanged(
    gateway: FinanceGateway,
    wallet: Wallet,
    transaction: WagerTransaction,
    ledgerEntry: WalletLedgerEntry,
    correlationId: string,
    now: Date,
  ): Promise<void> {
    await gateway.insertOutbox(
      OutboxMessage.enqueue(
        WalletBalanceChanged.create({
          eventId: uuidv7(),
          aggregateId: wallet.id,
          correlationId,
          occurredAt: now,
          data: {
            walletId: wallet.id,
            transactionId: transaction.id,
            direction: ledgerEntry.direction,
            money: ledgerEntry.money.toJSON(),
            balanceBefore: ledgerEntry.balanceBefore.toJSON(),
            balanceAfter: ledgerEntry.balanceAfter.toJSON(),
            walletVersion: wallet.version,
          },
        }),
      ),
    );
  }
}
