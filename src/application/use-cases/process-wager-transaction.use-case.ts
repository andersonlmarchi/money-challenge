import { Injectable } from '@nestjs/common';
import type {
  ProcessWagerTransactionCommand,
  ProcessWagerTransactionResult,
} from '../dtos/finance.dtos.js';
import { FinanceGateway } from '../../infrastructure/persistence/gateways/finance.gateway.js';
import { MikroOrmUnitOfWork } from '../../infrastructure/persistence/unit-of-work.js';
import { ProcessWagerTransactionService } from '../services/process-wager-transaction.service.js';

@Injectable()
export class ProcessWagerTransactionUseCase {
  private readonly service = new ProcessWagerTransactionService();

  constructor(private readonly unitOfWork: MikroOrmUnitOfWork) {}

  async execute(command: ProcessWagerTransactionCommand): Promise<ProcessWagerTransactionResult> {
    return this.unitOfWork.transactional(async (em) => {
      const gateway = new FinanceGateway(em);
      return this.service.execute(gateway, command, new Date());
    });
  }
}
