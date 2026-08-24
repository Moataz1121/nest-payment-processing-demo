import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  message: string;
  statusCode: number;
  data: T | null;
  errors: any[] | null;
  meta: any[] | Record<string, any> | null;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((res) => {
        let message = 'Request successful';
        let data = res;
        let meta = null;

        if (res && typeof res === 'object' && !Array.isArray(res)) {
          if ('message' in res) {
            message = res.message;
          }
          if ('meta' in res) {
            meta = res.meta;
          }
          if ('data' in res) {
            data = res.data;
          } else if ('message' in res || 'meta' in res) {
            const { message: _m, meta: _meta, ...rest } = res;
            data = Object.keys(rest).length > 0 ? rest : null;
          }
        }

        return {
          message,
          statusCode: response.statusCode,
          data: data ?? null,
          errors: null,
          meta: meta ?? null,
        };
      }),
    );
  }
}
