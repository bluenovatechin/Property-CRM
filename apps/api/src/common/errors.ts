import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

/** Every error leaves the API as { error: { code, message, details? } } (SRS NFR-16). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        return res.status(status).json({ error: body });
      }
      const message =
        status === 429
          ? 'Too many requests. Please slow down and try again in a minute.'
          : typeof body === 'string'
            ? body
            : (body as { message?: string | string[] }).message;
      return res.status(status).json({
        error: { code: HttpStatus[status] ?? 'ERROR', message: Array.isArray(message) ? message.join(', ') : message },
      });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these details already exists.', details: exception.meta } });
      }
      if (exception.code === 'P2025') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
      }
    }

    const requestId = randomUUID();
    this.logger.error(`[${requestId}] ${exception instanceof Error ? exception.stack : String(exception)}`);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.', requestId } });
  }
}

export class BusinessError extends HttpException {
  constructor(code: string, message: string, status: number = HttpStatus.CONFLICT) {
    super({ code, message }, status);
  }
}

export class NotFound extends HttpException {
  constructor(what = 'Record') {
    super({ code: 'NOT_FOUND', message: `${what} not found.` }, HttpStatus.NOT_FOUND);
  }
}
