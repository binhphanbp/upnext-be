import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class PrismaSerializeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (data === null || data === undefined || data instanceof StreamableFile) {
          return data;  
        }
        try {
          return JSON.parse(JSON.stringify(data)) as unknown;
        } catch {
          return data;
        }
      }),
    );
  }
}
