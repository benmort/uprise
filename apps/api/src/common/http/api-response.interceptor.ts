import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map, Observable } from "rxjs";
import type { RequestWithId } from "./request-id.middleware";

@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, { ok: true; data: T; requestId?: string }>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ ok: true; data: T; requestId?: string }> {
    const req = context.switchToHttp().getRequest<RequestWithId>();
    return next.handle().pipe(
      map((data) => ({
        ok: true,
        data,
        requestId: req.requestId,
      })),
    );
  }
}
