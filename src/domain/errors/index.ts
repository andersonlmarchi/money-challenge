export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidMoneyError extends DomainError {}

export class CurrencyMismatchError extends DomainError {}

export class InvalidTransactionStateError extends DomainError {}

export class InsufficientBalanceError extends DomainError {}

export class IdempotencyConflictError extends DomainError {}

export class WalletNotFoundError extends DomainError {}

export class DuplicateWalletError extends DomainError {}

export class ReferenceNotFoundError extends DomainError {}

export class InvalidReferenceError extends DomainError {}

export class TransactionNotFoundError extends DomainError {}

export class InvalidPayloadError extends DomainError {}
