import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ??
      (request.headers['idempotency-key'] as string | undefined) ??
      request.headers['x-request-id']?.toString();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            JSON.stringify({
              correlationId,
              method: request.method,
              path: request.path,
              statusCode: response.statusCode,
              durationMs: Date.now() - startedAt,
              walletId: request.params['walletId'],
              providerId: request.params['providerId'],
            }),
          );
        },
        error: (error: unknown) => {
          this.logger.error(
            JSON.stringify({
              correlationId,
              method: request.method,
              path: request.path,
              durationMs: Date.now() - startedAt,
              error: error instanceof Error ? error.name : 'Error',
              message: error instanceof Error ? error.message : 'unknown',
            }),
          );
        },
      }),
    );
  }
}
