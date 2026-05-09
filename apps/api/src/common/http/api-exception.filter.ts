import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { RequestWithId } from "./request-id.middleware";
import { DomainLogger } from "../logging/domain-logger.service";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger?: DomainLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const req = ctx.getRequest<RequestWithId>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Unexpected server error";
    let code = "INTERNAL_ERROR";
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === "object" && payload !== null) {
        const maybe = payload as Record<string, unknown>;
        if (maybe.ok === false && typeof maybe.error === "object" && maybe.error) {
          response.status(status).json({
            ...payload,
            requestId: req.requestId,
          });
          return;
        }
        message = String(maybe.message || maybe.error || exception.message);
        details = payload;
      } else {
        message = String(payload);
      }
      code = "HTTP_ERROR";
    } else if (exception instanceof Error) {
      code = "UNHANDLED_ERROR";
      this.logger?.error("http", "Unhandled exception", exception.stack, {
        message: exception.message,
        requestId: req.requestId,
        path: req.originalUrl || req.url,
      });
    } else {
      this.logger?.error("http", "Unknown non-error exception", undefined, {
        requestId: req.requestId,
        path: req.originalUrl || req.url,
      });
    }

    response.status(status).json({
      ok: false,
      error: { code, message, details },
      requestId: req.requestId,
    });
  }
}
