import {
  FailureCode,
  LedgerDirection,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../enums/index.js';
import { InvalidTransactionStateError } from '../errors/index.js';
import { Money } from '../money/index.js';

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  referenceRetryAttempts?: number;
  nextReferenceAttemptAt?: Date;
  createdAt?: Date;
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  referenceTransactionId?: string;
  status: WagerTransactionStatus;
  failureCode?: FailureCode;
  observedBalance?: Money;
  processedAt?: Date;
  createdAt: Date;
  referenceRetryAttempts?: number;
  nextReferenceAttemptAt?: Date;
}

const TERMINAL_STATUSES = new Set<WagerTransactionStatus>([
  WagerTransactionStatus.Processed,
  WagerTransactionStatus.Rejected,
  WagerTransactionStatus.Failed,
]);

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _observedBalance?: Money,
    private _processedAt?: Date,
    private _referenceRetryAttempts = 0,
    private _nextReferenceAttemptAt?: Date,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if (props.kind === WagerTransactionKind.Opening) {
      throw new InvalidTransactionStateError('OPENING transactions cannot be submitted externally');
    }

    if (WagerTransaction.requiresReferenceKind(props.kind) && !props.referenceExternalTransactionId) {
      throw new InvalidTransactionStateError(
        `${props.kind} requires referenceExternalTransactionId`,
      );
    }

    return WagerTransaction.newPending(props);
  }

  static createOpening(props: {
    id: string;
    walletId: string;
    playerId: string;
    money: Money;
    idempotencyKey: string;
    payloadHash: string;
    createdAt?: Date;
  }): WagerTransaction {
    return WagerTransaction.newPending({
      id: props.id,
      providerId: 'internal',
      externalTransactionId: props.id,
      idempotencyKey: props.idempotencyKey,
      payloadHash: props.payloadHash,
      walletId: props.walletId,
      playerId: props.playerId,
      roundId: 'opening',
      gameId: 'wallet-open',
      kind: WagerTransactionKind.Opening,
      money: props.money,
      createdAt: props.createdAt,
    });
  }

  private static newPending(props: CreateWagerTransactionProps): WagerTransaction {
    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      props.createdAt ?? new Date(),
      WagerTransactionStatus.Pending,
      undefined,
      undefined,
      undefined,
      undefined,
      props.referenceRetryAttempts ?? 0,
      props.nextReferenceAttemptAt,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      state.money,
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.observedBalance,
      state.processedAt,
      state.referenceRetryAttempts ?? 0,
      state.nextReferenceAttemptAt,
    );
  }

  get referenceRetryAttempts(): number {
    return this._referenceRetryAttempts;
  }

  get nextReferenceAttemptAt(): Date | undefined {
    return this._nextReferenceAttemptAt;
  }

  isReferenceRetryDue(now: Date): boolean {
    if (this._status !== WagerTransactionStatus.PendingReference) {
      return false;
    }
    if (!this._nextReferenceAttemptAt) {
      return true;
    }
    return this._nextReferenceAttemptAt.getTime() <= now.getTime();
  }

  scheduleReferenceRetry(now: Date, delayMs: number): void {
    this._referenceRetryAttempts += 1;
    this._nextReferenceAttemptAt = new Date(now.getTime() + delayMs);
  }

  clearReferenceRetrySchedule(): void {
    this._nextReferenceAttemptAt = undefined;
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get observedBalance(): Money | undefined {
    return this._observedBalance;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  markProcessed(
    referenceTransactionId: string | undefined,
    observedBalance: Money | undefined,
    at: Date,
  ): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._observedBalance = observedBalance;
    this._processedAt = at;
  }

  markPendingReference(): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.PendingReference;
  }

  reject(code: FailureCode, observedBalance: Money | undefined, at: Date): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
    this._observedBalance = observedBalance;
    this._processedAt = at;
  }

  fail(code: FailureCode, at: Date): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
    this._processedAt = at;
  }

  isTerminal(): boolean {
    return TERMINAL_STATUSES.has(this._status);
  }

  affectsBalance(): boolean {
    if (this._status === WagerTransactionStatus.Rejected) {
      return false;
    }
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return WagerTransaction.requiresReferenceKind(this.kind);
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Rollback:
        if (!reference) {
          throw new InvalidTransactionStateError('ROLLBACK requires a reference transaction');
        }
        return reference.resolveLedgerDirection() === LedgerDirection.Debit
          ? LedgerDirection.Credit
          : LedgerDirection.Debit;
      case WagerTransactionKind.Loss:
        throw new InvalidTransactionStateError('LOSS does not produce ledger entries');
      default:
        throw new InvalidTransactionStateError(`Unsupported kind ${this.kind as string}`);
    }
  }

  resolveLedgerDirection(): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Loss:
        throw new InvalidTransactionStateError('LOSS does not produce ledger entries');
      default:
        throw new InvalidTransactionStateError(`Unsupported kind ${this.kind as string}`);
    }
  }

  private assertNotTerminal(): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(
        `Transaction ${this.id} is terminal (${this._status}) and cannot transition`,
      );
    }
  }

  private static requiresReferenceKind(kind: WagerTransactionKind): boolean {
    return kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback;
  }
}
