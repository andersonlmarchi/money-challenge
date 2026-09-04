import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from './infrastructure/persistence/mikro-orm.config.js';
import { PersistenceModule } from './infrastructure/persistence/persistence.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(mikroOrmConfig),
    PersistenceModule,
    FinanceModule,
  ],
})
export class AppModule {}
