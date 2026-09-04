import { Module } from '@nestjs/common';
import { OpenWalletUseCase } from '../../application/use-cases/open-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case.js';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module.js';

@Module({
  imports: [PersistenceModule],
  providers: [OpenWalletUseCase, ProcessWagerTransactionUseCase],
  exports: [OpenWalletUseCase, ProcessWagerTransactionUseCase],
})
export class FinanceModule {}
