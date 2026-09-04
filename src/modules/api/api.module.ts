import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module.js';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module.js';
import { ObservabilityModule } from '../../infrastructure/observability/observability.module.js';
import { WalletsController } from './controllers/wallets.controller.js';
import { WageringController } from './controllers/wagering.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { MetricsController } from './controllers/metrics.controller.js';
import { GetWalletUseCase } from '../../application/use-cases/get-wallet.use-case.js';
import { GetWalletLedgerUseCase } from '../../application/use-cases/get-wallet-ledger.use-case.js';
import { GetWagerTransactionUseCase } from '../../application/use-cases/get-wager-transaction.use-case.js';
import { GetWagerTransactionByExternalIdUseCase } from '../../application/use-cases/get-wager-transaction-by-external-id.use-case.js';

@Module({
  imports: [PersistenceModule, FinanceModule, ObservabilityModule],
  controllers: [WalletsController, WageringController, HealthController, MetricsController],
  providers: [
    GetWalletUseCase,
    GetWalletLedgerUseCase,
    GetWagerTransactionUseCase,
    GetWagerTransactionByExternalIdUseCase,
  ],
})
export class ApiModule {}
