import { ReflectMetadataProvider } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import {
  InboxMessageEntity,
  OutboxMessageEntity,
  WalletEntity,
  WalletLedgerEntryEntity,
  WagerTransactionEntity,
} from './entities/index.js';

const entities = [
  WalletEntity,
  WagerTransactionEntity,
  WalletLedgerEntryEntity,
  InboxMessageEntity,
  OutboxMessageEntity,
];

export default defineConfig({
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: Number(process.env['DATABASE_PORT'] ?? 5432),
  dbName: process.env['DATABASE_NAME'] ?? 'wagering',
  user: process.env['DATABASE_USER'] ?? 'wagering',
  password: process.env['DATABASE_PASSWORD'] ?? 'wagering',
  entities,
  metadataProvider: ReflectMetadataProvider,
  extensions: [Migrator],
  migrations: {
    path: './dist/infrastructure/persistence/migrations',
    pathTs: './src/infrastructure/persistence/migrations',
    transactional: true,
    disableForeignKeys: false,
    allOrNothing: true,
  },
  debug: process.env['NODE_ENV'] !== 'production',
});
