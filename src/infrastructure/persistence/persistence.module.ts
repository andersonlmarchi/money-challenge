import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  INBOX_REPOSITORY,
  LEDGER_REPOSITORY,
  OUTBOX_REPOSITORY,
  WALLET_REPOSITORY,
  WAGER_TRANSACTION_REPOSITORY,
} from '../../application/ports/index.js';
import {
  InboxMessageEntity,
  OutboxMessageEntity,
  WalletEntity,
  WalletLedgerEntryEntity,
  WagerTransactionEntity,
} from './entities/index.js';
import { MikroOrmInboxRepository } from './repositories/mikro-orm-inbox.repository.js';
import { MikroOrmLedgerRepository } from './repositories/mikro-orm-ledger.repository.js';
import { MikroOrmOutboxRepository } from './repositories/mikro-orm-outbox.repository.js';
import { MikroOrmWalletRepository } from './repositories/mikro-orm-wallet.repository.js';
import { MikroOrmWagerTransactionRepository } from './repositories/mikro-orm-wager-transaction.repository.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      WalletEntity,
      WagerTransactionEntity,
      WalletLedgerEntryEntity,
      InboxMessageEntity,
      OutboxMessageEntity,
    ]),
  ],
  providers: [
    { provide: WALLET_REPOSITORY, useClass: MikroOrmWalletRepository },
    { provide: WAGER_TRANSACTION_REPOSITORY, useClass: MikroOrmWagerTransactionRepository },
    { provide: LEDGER_REPOSITORY, useClass: MikroOrmLedgerRepository },
    { provide: INBOX_REPOSITORY, useClass: MikroOrmInboxRepository },
    { provide: OUTBOX_REPOSITORY, useClass: MikroOrmOutboxRepository },
  ],
  exports: [
    WALLET_REPOSITORY,
    WAGER_TRANSACTION_REPOSITORY,
    LEDGER_REPOSITORY,
    INBOX_REPOSITORY,
    OUTBOX_REPOSITORY,
  ],
})
export class PersistenceModule {}
