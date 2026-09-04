import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from './infrastructure/persistence/mikro-orm.config.js';
import { PersistenceModule } from './infrastructure/persistence/persistence.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(mikroOrmConfig),
    PersistenceModule,
  ],
})
export class AppModule {}
