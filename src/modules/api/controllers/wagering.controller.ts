import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { WagerTransactionStatus } from '../../../domain/enums/index.js';
import { InvalidPayloadError } from '../../../domain/errors/index.js';
import { ProcessWagerTransactionUseCase } from '../../../application/use-cases/process-wager-transaction.use-case.js';
import { GetWagerTransactionUseCase } from '../../../application/use-cases/get-wager-transaction.use-case.js';
import { GetWagerTransactionByExternalIdUseCase } from '../../../application/use-cases/get-wager-transaction-by-external-id.use-case.js';
import type {
  ProcessWagerTransactionResult,
  SubmitWagerTransactionBody,
} from '../../../application/dtos/finance.dtos.js';
import { AuthGuard } from '../../../infrastructure/http/guards/auth.guard.js';
import { MetricsService } from '../../../infrastructure/observability/metrics.service.js';

@Controller()
@UseGuards(AuthGuard)
export class WageringController {
  constructor(
    private readonly processWager: ProcessWagerTransactionUseCase,
    private readonly getWagerTransaction: GetWagerTransactionUseCase,
    private readonly getWagerTransactionByExternalId: GetWagerTransactionByExternalIdUseCase,
    private readonly metricsService: MetricsService,
  ) {}

  @Post('wagering/transactions')
  async submit(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SubmitWagerTransactionBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProcessWagerTransactionResult> {
    if (!idempotencyKey?.trim()) {
      throw new InvalidPayloadError('Idempotency-Key header is required');
    }

    const endTimer = this.metricsService.processingLatencySeconds.startTimer({ kind: body.kind });
    const result = await this.processWager.execute({
      ...body,
      idempotencyKey,
      correlationId: idempotencyKey,
    });
    endTimer();

    this.metricsService.recordWagerResult(body.kind, result.status, result.idempotentReplay);

    if (result.status === WagerTransactionStatus.Rejected) {
      response.status(422);
    } else if (result.status === WagerTransactionStatus.PendingReference) {
      response.status(202);
    }

    return result;
  }

  @Get('wagering/transactions/:transactionId')
  async findById(@Param('transactionId') transactionId: string) {
    return this.getWagerTransaction.execute(transactionId);
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  async findByExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    return this.getWagerTransactionByExternalId.execute(providerId, externalTransactionId);
  }
}
