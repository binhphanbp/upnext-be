import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class PrismaSerializeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => {
        if (data === null || data === undefined) {
          return data;
        }
        try {
          return JSON.parse(JSON.stringify(data));
        } catch (e) {
          return data;
        }
      }),
    );
  }
}
