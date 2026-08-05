import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { ApiExceptionFilter } from "./api-exception.filter";
import type { ErrorLogService } from "../errors/error-log.service";

function makeHost(req: Record<string, unknown> = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const request = {
    requestId: "req-1",
    method: "POST",
    originalUrl: "/api/v1/iam/invite/accept",
    ...req,
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("ApiExceptionFilter – durable capture", () => {
  let errors: { record: jest.Mock };
  let filter: ApiExceptionFilter;

  beforeEach(() => {
    errors = { record: jest.fn() };
    filter = new ApiExceptionFilter(undefined, errors as unknown as ErrorLogService);
  });

  it("records an unhandled error with the request context", () => {
    const { host } = makeHost({ user: { id: "u1", tenantId: "t1" } });
    filter.catch(new Error("kaboom"), host);
    expect(errors.record).toHaveBeenCalledTimes(1);
    expect(errors.record.mock.calls[0][0]).toMatchObject({
      source: "api",
      message: "Unexpected server error",
      name: "UNHANDLED_ERROR",
      method: "POST",
      path: "/api/v1/iam/invite/accept",
      statusCode: 500,
      requestId: "req-1",
      tenantId: "t1",
      userId: "u1",
    });
    expect(errors.record.mock.calls[0][0].stack).toContain("kaboom");
  });

  // 4xx is the API correctly refusing a bad request. Recording those would bury real
  // faults under validation noise.
  it("does NOT record a 4xx", () => {
    const { host } = makeHost();
    filter.catch(new BadRequestException("Invalid or expired invitation"), host);
    expect(errors.record).not.toHaveBeenCalled();
  });

  it("records a deliberately-thrown 5xx HttpException", () => {
    const { host } = makeHost();
    filter.catch(new HttpException("upstream died", HttpStatus.BAD_GATEWAY), host);
    expect(errors.record).toHaveBeenCalledTimes(1);
    expect(errors.record.mock.calls[0][0]).toMatchObject({ statusCode: 502 });
  });

  it("records a 5xx that already carries the shaped {ok:false,error} envelope", () => {
    const { host, json } = makeHost();
    filter.catch(
      new HttpException(
        { ok: false, error: { code: "OUTBOX_STUCK", message: "relay failed" } },
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
      host,
    );
    expect(errors.record).toHaveBeenCalledTimes(1);
    expect(errors.record.mock.calls[0][0]).toMatchObject({
      name: "OUTBOX_STUCK",
      message: "relay failed",
      statusCode: 500,
    });
    // …and the shaped envelope still reaches the client unchanged.
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, requestId: "req-1" }),
    );
  });

  it("does not record a 4xx that carries the shaped envelope", () => {
    const { host } = makeHost();
    filter.catch(
      new HttpException(
        { ok: false, error: { code: "PLAN_LIMIT", message: "seat limit" } },
        HttpStatus.FORBIDDEN,
      ),
      host,
    );
    expect(errors.record).not.toHaveBeenCalled();
  });

  it("still responds when no error store is wired in", () => {
    const bare = new ApiExceptionFilter();
    const { host, status, json } = makeHost();
    expect(() => bare.catch(new Error("kaboom"), host)).not.toThrow();
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalled();
  });
});
