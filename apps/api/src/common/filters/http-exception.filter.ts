import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Wraps every error into the SCAFFOLD §5.3 envelope:
 * { error: { code, message, details } } — no raw stack traces to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let body: unknown =
      exception instanceof HttpException ? exception.getResponse() : { message: 'Internal server error' };

    if (typeof body === 'string') body = { message: body };
    const b = (body ?? {}) as Record<string, unknown>;

    if (status >= 500) {
      // Log unexpected errors (500) — 4xx client errors stay quiet.
      console.error('[http-exception-filter]', exception);
    }

    res.status(status).json({
      error: {
        code: b.code ?? 'INTERNAL_ERROR',
        message: b.message ?? 'Internal server error',
        details: b.details ?? {},
      },
    });
  }
}
