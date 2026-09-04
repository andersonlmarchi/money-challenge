import { Injectable, Inject } from '@nestjs/common';
import { WAGER_TRANSACTION_REPOSITORY } from '../ports/wager-transaction.repository.js';
import type { WagerTransactionRepository } from '../ports/wager-transaction.repository.js';
import { TransactionNotFoundError } from '../../domain/errors/index.js';
import type { GetWagerTransactionResult } from '../dtos/finance.dtos.js';
import { toWagerTransactionView } from '../mappers/wager-transaction-view.mapper.js';

@Injectable()
export class GetWagerTransactionUseCase {
  constructor(
    @Inject(WAGER_TRANSACTION_REPOSITORY) private readonly transactions: WagerTransactionRepository,
  ) {}

  async execute(transactionId: string): Promise<GetWagerTransactionResult> {
    const transaction = await this.transactions.findById(transactionId);
    if (!transaction) {
      throw new TransactionNotFoundError(`Transaction ${transactionId} not found`);
    }

    return toWagerTransactionView(transaction);
  }
}
