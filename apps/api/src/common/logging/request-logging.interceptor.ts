import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { tap } from "rxjs/operators";
import { Observable } from "rxjs";
import type { Request, Response } from "express";
import { DomainLogger } from "./domain-logger.service";
import type { RequestWithId } from "../http/request-id.middleware";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: DomainLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const req = context.switchToHttp().getRequest<RequestWithId & Request>();
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log("http", `${req.method} ${req.url}`, {
            statusCode: res.statusCode,
            requestId: req.requestId,
            elapsedMs: Date.now() - now,
          });
        },
      }),
    );
  }
}
