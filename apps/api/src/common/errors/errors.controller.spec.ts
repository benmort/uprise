import { validate } from "class-validator";
import { ClientErrorDto, ErrorsController } from "./errors.controller";
import type { ErrorLogService } from "./error-log.service";

const check = (patch: Record<string, unknown>) =>
  validate(Object.assign(new ClientErrorDto(), { source: "admin", message: "boom", ...patch }));

describe("ClientErrorDto", () => {
  it("accepts a report from each known first-party app", async () => {
    for (const source of ["admin", "auth", "field", "action", "marketing"]) {
      expect(await check({ source })).toHaveLength(0);
    }
  });

  // `source` is a closed list so the column stays a dimension you can group by,
  // rather than free text arriving from the open internet.
  it("rejects an unknown source", async () => {
    expect((await check({ source: "attacker" })).length).toBeGreaterThan(0);
  });

  it("rejects a missing message", async () => {
    expect((await check({ message: undefined })).length).toBeGreaterThan(0);
  });

  it("rejects oversized fields at the edge", async () => {
    expect((await check({ message: "x".repeat(2_001) })).length).toBeGreaterThan(0);
    expect((await check({ stack: "x".repeat(20_001) })).length).toBeGreaterThan(0);
  });
});

describe("ErrorsController", () => {
  const req = (extra: Record<string, unknown> = {}) =>
    ({ headers: { "user-agent": "Chrome/150" }, ...extra }) as never;

  it("attributes an anonymous report with null tenant/user", () => {
    const errors = { record: jest.fn() };
    new ErrorsController(errors as unknown as ErrorLogService).report(
      Object.assign(new ClientErrorDto(), {
        source: "admin",
        message: "server-side exception",
        digest: "3401234567",
      }),
      req(),
    );
    expect(errors.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "admin",
        message: "server-side exception",
        // Next's digest is the only handle a user can read off the screen, so it
        // becomes the correlation id.
        requestId: "3401234567",
        tenantId: null,
        userId: null,
      }),
    );
  });

  it("attributes the report to the session when there is one", () => {
    const errors = { record: jest.fn() };
    new ErrorsController(errors as unknown as ErrorLogService).report(
      Object.assign(new ClientErrorDto(), { source: "admin", message: "boom" }),
      req({ user: { id: "u1", tenantId: "t1" } }),
    );
    expect(errors.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", userId: "u1" }),
    );
  });
});
