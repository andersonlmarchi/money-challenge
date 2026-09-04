import { Injectable, Logger } from '@nestjs/common';
import { Money } from '../../domain/money/index.js';
import { WalletNotFoundError } from '../../domain/errors/index.js';
import type { ReconcileWalletCommand, ReconcileWalletResult } from '../dtos/finance.dtos.js';
import { FinanceGateway } from '../../infrastructure/persistence/gateways/finance.gateway.js';
import { MikroOrmUnitOfWork } from '../../infrastructure/persistence/unit-of-work.js';

@Injectable()
export class ReconcileWalletUseCase {
  private readonly logger = new Logger(ReconcileWalletUseCase.name);

  constructor(private readonly unitOfWork: MikroOrmUnitOfWork) {}

  async execute(command: ReconcileWalletCommand): Promise<ReconcileWalletResult> {
    return this.unitOfWork.transactional(async (em) => {
      const gateway = new FinanceGateway(em);
      const wallet = await gateway.findWalletById(command.walletId);
      if (!wallet) {
        throw new WalletNotFoundError(`Wallet ${command.walletId} not found`);
      }

      const storedBalance = wallet.balance;
      const checkedEntries = await gateway.countLedgerEntries(wallet.id);
      const ledgerNet = await gateway.sumLedgerNet(wallet.id, wallet.currency);
      const calculatedBalance = Money.rehydrate({
        amount: ledgerNet,
        currency: wallet.currency,
      });
      const difference = storedBalance.subtract(calculatedBalance);
      const consistent = difference.isZero();

      if (!consistent) {
        this.logger.warn(
          `Wallet reconciliation mismatch walletId=${wallet.id} stored=${storedBalance.toAmountString()} calculated=${calculatedBalance.toAmountString()} difference=${difference.toAmountString()}`,
        );
      }

      return {
        walletId: wallet.id,
        storedBalance: storedBalance.toJSON(),
        calculatedBalance: calculatedBalance.toJSON(),
        difference: difference.toJSON(),
        consistent,
        checkedEntries,
      };
    });
  }
}
