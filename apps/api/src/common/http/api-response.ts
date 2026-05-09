import { HttpException, HttpStatus } from "@nestjs/common";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
  requestId?: string;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export class ApiHttpException extends HttpException {
  constructor(code: string, message: string, status = HttpStatus.BAD_REQUEST, details?: unknown) {
    super(
      {
        ok: false,
        error: { code, message, details },
      } satisfies ApiFailure,
      status,
    );
  }
}

export function apiOk<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { ok: true, data, meta };
}

export function apiError(code: string, message: string, details?: unknown): ApiFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}
