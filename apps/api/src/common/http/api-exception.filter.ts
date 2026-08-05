import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { RequestWithId } from "./request-id.middleware";
import { DomainLogger } from "../logging/domain-logger.service";
import type { ErrorLogService } from "../errors/error-log.service";
import type { AuthUser } from "../../auth/auth-user";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger?: DomainLogger,
    // Optional so the filter stays constructible in tests and in any boot path that
    // hasn't resolved the container yet – capture is additive to the response, never
    // a precondition for it.
    private readonly errors?: ErrorLogService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const req = ctx.getRequest<RequestWithId & { user?: AuthUser }>();

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
          const shaped = maybe.error as Record<string, unknown>;
          this.persist(req, status, {
            name: String(shaped.code ?? "HTTP_ERROR"),
            message: String(shaped.message ?? exception.message),
            stack: exception.stack,
          });
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

    this.persist(req, status, {
      name: code,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json({
      ok: false,
      error: { code, message, details },
      requestId: req.requestId,
    });
  }

  /**
   * Record a server fault for later diagnosis. 5xx only – a 4xx is the API correctly
   * refusing a bad request, and keeping those would bury the real faults under
   * validation noise. Fire-and-forget by contract (ErrorLogService.record swallows its
   * own failures), so nothing here can turn an error response into a worse one.
   */
  private persist(
    req: RequestWithId & { user?: AuthUser },
    status: number,
    detail: { name: string; message: string; stack?: string },
  ): void {
    if (status < 500) return;
    this.errors?.record({
      source: "api",
      message: detail.message,
      name: detail.name,
      stack: detail.stack,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: status,
      requestId: req.requestId,
      tenantId: req.user?.tenantId ?? null,
      userId: req.user?.id ?? null,
    });
  }
}
