import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from './infrastructure/persistence/mikro-orm.config.js';
import { PersistenceModule } from './infrastructure/persistence/persistence.module.js';
import { ObservabilityModule } from './infrastructure/observability/observability.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { ApiModule } from './modules/api/api.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(mikroOrmConfig),
    ObservabilityModule,
    PersistenceModule,
    FinanceModule,
    MessagingModule,
    ApiModule,
  ],
})
export class AppModule {}
