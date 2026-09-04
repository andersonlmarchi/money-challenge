import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OpenWalletUseCase } from '../../../application/use-cases/open-wallet.use-case.js';
import { GetWalletUseCase } from '../../../application/use-cases/get-wallet.use-case.js';
import { GetWalletLedgerUseCase } from '../../../application/use-cases/get-wallet-ledger.use-case.js';
import { ReconcileWalletUseCase } from '../../../application/use-cases/reconcile-wallet.use-case.js';
import type {
  OpenWalletCommand,
  ReconcileWalletResult,
} from '../../../application/dtos/finance.dtos.js';
import { AuthGuard } from '../../../infrastructure/http/guards/auth.guard.js';

@Controller('wallets')
@UseGuards(AuthGuard)
export class WalletsController {
  constructor(
    private readonly openWallet: OpenWalletUseCase,
    private readonly getWallet: GetWalletUseCase,
    private readonly getWalletLedger: GetWalletLedgerUseCase,
    private readonly reconcileWallet: ReconcileWalletUseCase,
  ) {}

  @Post()
  async create(@Body() body: OpenWalletCommand) {
    return this.openWallet.execute(body);
  }

  @Get(':walletId')
  async findOne(@Param('walletId') walletId: string) {
    return this.getWallet.execute(walletId);
  }

  @Get(':walletId/ledger')
  async ledger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getWalletLedger.execute({
      walletId,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':walletId/reconciliation')
  async reconcile(@Param('walletId') walletId: string): Promise<ReconcileWalletResult> {
    return this.reconcileWallet.execute({ walletId });
  }
}
