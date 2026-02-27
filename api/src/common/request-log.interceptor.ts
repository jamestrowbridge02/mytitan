import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Request');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    const requestId = String(req?.requestId ?? req?.headers?.['x-request-id'] ?? 'unknown');
    const method = String(req?.method ?? '-');
    const url = String(req?.originalUrl ?? req?.url ?? '-');
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const statusCode = Number(res?.statusCode ?? 200);
        const durationMs = Date.now() - startedAt;
        this.logger.log(
          `requestId=${requestId} method=${method} url=${url} status=${statusCode} durationMs=${durationMs}`,
        );
      }),
      catchError((error: unknown) => {
        const statusCode = error instanceof HttpException ? error.getStatus() : 500;
        const durationMs = Date.now() - startedAt;
        this.logger.error(
          `requestId=${requestId} method=${method} url=${url} status=${statusCode} durationMs=${durationMs}`,
        );
        return throwError(() => error);
      }),
    );
  }
}
