import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

const httpStatusCodes = HttpStatus as Record<number, string>;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = this.resolveMessage(exceptionResponse, exception);
    const code = this.resolveCode(status);

    response.status(status).json({
      error: {
        code,
        message,
        details: typeof exceptionResponse === 'object' ? exceptionResponse : undefined
      }
    });
  }

  private resolveMessage(exceptionResponse: unknown, exception: unknown): string {
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const message = (exceptionResponse as { message: unknown }).message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Unexpected server error.';
  }

  private resolveCode(status: number): string {
    return httpStatusCodes[status] ?? 'INTERNAL_SERVER_ERROR';
  }
}
