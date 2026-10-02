import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

const BUSINESS_CODES: Record<string, string> = {
  'Card is not active': 'CARD_INACTIVE',
  'Card not found': 'CARD_NOT_FOUND',
  'Invalid student': 'STUDENT_INACTIVE',
  'Account not found': 'ACCOUNT_NOT_FOUND',
  'Account is frozen': 'ACCOUNT_FROZEN',
  'Insufficient balance': 'INSUFFICIENT_BALANCE',
  'Daily limit exceeded': 'DAILY_LIMIT_EXCEEDED',
  'Idempotency key was already used with a different request':
    'IDEMPOTENCY_CONFLICT',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    if (response.headersSent || response.writableEnded) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    const detail =
      typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)
        : {};
    const message =
      status >= 500 && !detail.code
        ? 'Internal server error'
        : (detail.message ??
          (typeof raw === 'string' ? raw : 'Internal server error'));
    const codes: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      429: 'RATE_LIMITED',
    };
    const code =
      detail.code ??
      (typeof message === 'string' ? BUSINESS_CODES[message] : undefined) ??
      codes[status] ??
      'INTERNAL_ERROR';
    if (status >= 500)
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    if (status === 429 || code === 'PAYMENT_IN_PROGRESS')
      response.setHeader('Retry-After', '2');

    this.logger.warn(`HTTP ${status}: ${message}`);

    response.status(status).json({
      success: false,
      data: null,
      code,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
