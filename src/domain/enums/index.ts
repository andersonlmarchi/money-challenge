export enum WagerTransactionKind {
  Opening = 'OPENING',
  Bet = 'BET',
  Win = 'WIN',
  Loss = 'LOSS',
  Refund = 'REFUND',
  Rollback = 'ROLLBACK',
}

export enum WagerTransactionStatus {
  Pending = 'PENDING',
  PendingReference = 'PENDING_REFERENCE',
  Processed = 'PROCESSED',
  Rejected = 'REJECTED',
  Failed = 'FAILED',
}

export enum LedgerDirection {
  Debit = 'DEBIT',
  Credit = 'CREDIT',
}

export enum FailureCode {
  InsufficientBalance = 'INSUFFICIENT_BALANCE',
  ReversalWouldCauseNegativeBalance = 'REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE',
  InvalidReference = 'INVALID_REFERENCE',
  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  ReferenceAlreadyReversed = 'REFERENCE_ALREADY_REVERSED',
  InvalidRefundAmount = 'INVALID_REFUND_AMOUNT',
  InvalidRollbackAmount = 'INVALID_ROLLBACK_AMOUNT',
  CurrencyMismatch = 'CURRENCY_MISMATCH',
  WalletNotFound = 'WALLET_NOT_FOUND',
  DuplicateWallet = 'DUPLICATE_WALLET',
  IdempotencyConflict = 'IDEMPOTENCY_CONFLICT',
  InvalidTransactionState = 'INVALID_TRANSACTION_STATE',
  InvalidPayload = 'INVALID_PAYLOAD',
  ReferenceScopeMismatch = 'REFERENCE_SCOPE_MISMATCH',
}
