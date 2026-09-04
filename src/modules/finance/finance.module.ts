import { Module } from '@nestjs/common';
import { OpenWalletUseCase } from '../../application/use-cases/open-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case.js';
import { ReconcileWalletUseCase } from '../../application/use-cases/reconcile-wallet.use-case.js';
import { ReprocessPendingReferenceWorker } from '../../application/workers/reprocess-pending-reference.worker.js';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module.js';

@Module({
  imports: [PersistenceModule],
  providers: [
    OpenWalletUseCase,
    ProcessWagerTransactionUseCase,
    ReconcileWalletUseCase,
    ReprocessPendingReferenceWorker,
  ],
  exports: [
    OpenWalletUseCase,
    ProcessWagerTransactionUseCase,
    ReconcileWalletUseCase,
  ],
})
export class FinanceModule {}
