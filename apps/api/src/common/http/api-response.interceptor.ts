import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import { map, Observable } from "rxjs";
import type { RequestWithId } from "./request-id.middleware";

@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, { ok: true; data: T; requestId?: string } | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ ok: true; data: T; requestId?: string } | T> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<Response>();
    return next.handle().pipe(
      map((data) => {
        // Non-JSON responses must pass through RAW. The Twilio voice/SMS webhooks return
        // TwiML with `Content-Type: application/xml`; wrapping that in the { ok, data }
        // envelope makes Twilio fail with 12100 "Document parse failure" (the call never
        // dials → the Call row is stuck at INITIATED). CSV/text exports are the same. We
        // detect them two ways so it holds regardless of when `@Header` is applied: an
        // explicit non-JSON Content-Type, or a raw string body (our JSON DTOs are objects).
        const contentType = String(res.getHeader?.("content-type") ?? "").toLowerCase();
        const isNonJson = (contentType && !contentType.includes("application/json")) || typeof data === "string";
        if (isNonJson) return data;
        return { ok: true, data, requestId: req.requestId };
      }),
    );
  }
}
