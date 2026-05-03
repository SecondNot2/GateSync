import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

@Injectable()
export class ApiResponseInterceptor<TData> implements NestInterceptor<
  TData,
  { data: TData; meta: Record<string, never> }
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<TData>
  ): Observable<{ data: TData; meta: Record<string, never> }> {
    return next.handle().pipe(
      map((data: TData) => ({
        data,
        meta: {}
      }))
    );
  }
}
