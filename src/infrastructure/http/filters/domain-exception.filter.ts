import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrencyMismatchError,
  DomainError,
  DuplicateWalletError,
  IdempotencyConflictError,
  InvalidMoneyError,
  InvalidPayloadError,
  InvalidTransactionStateError,
  TransactionNotFoundError,
  WalletNotFoundError,
} from '../../../domain/errors/index.js';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = mapException(exception);

    response.status(mapped.statusCode).json({
      statusCode: mapped.statusCode,
      error: mapped.error,
      message: mapped.message,
    });
  }
}

function mapException(exception: unknown): {
  statusCode: number;
  error: string;
  message: string;
} {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const message =
      typeof body === 'string'
        ? body
        : typeof body === 'object' && body !== null && 'message' in body
          ? String((body as { message: unknown }).message)
          : exception.message;

    return {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
    };
  }

  if (exception instanceof InvalidPayloadError || exception instanceof InvalidMoneyError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: (exception as InvalidPayloadError).message,
    };
  }

  if (exception instanceof WalletNotFoundError || exception instanceof TransactionNotFoundError) {
    return {
      statusCode: HttpStatus.NOT_FOUND,
      error: 'Not Found',
      message: (exception as WalletNotFoundError).message,
    };
  }

  if (exception instanceof DuplicateWalletError || exception instanceof IdempotencyConflictError) {
    return {
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: (exception as DuplicateWalletError).message,
    };
  }

  if (
    exception instanceof InvalidTransactionStateError ||
    exception instanceof CurrencyMismatchError
  ) {
    return {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      error: 'Unprocessable Entity',
      message: (exception as InvalidTransactionStateError).message,
    };
  }

  if (exception instanceof DomainError) {
    return {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      error: 'Unprocessable Entity',
      message: exception.message,
    };
  }

  const message = exception instanceof Error ? exception.message : 'Internal server error';
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: 'Internal Server Error',
    message,
  };
}
