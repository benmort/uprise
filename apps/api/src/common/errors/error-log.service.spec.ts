import { Prisma } from "@uprise/db";
import { ErrorLogService } from "./error-log.service";

function makeService(create = jest.fn().mockResolvedValue({})) {
  const prisma = { errorLog: { create } } as never;
  return { svc: new ErrorLogService(prisma), create };
}

const dataOf = (create: jest.Mock) => create.mock.calls[0][0].data;

describe("ErrorLogService", () => {
  it("records a fully-specified error", async () => {
    const { svc, create } = makeService();
    svc.record({
      source: "api",
      message: "boom",
      name: "UNHANDLED_ERROR",
      stack: "at thing()",
      method: "POST",
      path: "/api/v1/iam/invite/accept",
      statusCode: 500,
      requestId: "req-1",
      tenantId: "t1",
      userId: "u1",
    });
    await Promise.resolve();
    expect(dataOf(create)).toMatchObject({
      source: "api",
      message: "boom",
      name: "UNHANDLED_ERROR",
      method: "POST",
      path: "/api/v1/iam/invite/accept",
      statusCode: 500,
      requestId: "req-1",
      tenantId: "t1",
      userId: "u1",
    });
  });

  it("drops a report with no usable message rather than writing an empty row", () => {
    const { svc, create } = makeService();
    svc.record({ source: "api", message: "   " });
    expect(create).not.toHaveBeenCalled();
  });

  it("normalises blank optional fields to null", async () => {
    const { svc, create } = makeService();
    svc.record({ source: "api", message: "boom", path: "  ", requestId: "" });
    await Promise.resolve();
    expect(dataOf(create)).toMatchObject({ path: null, requestId: null });
  });

  it("falls back to 'unknown' when source is blank", async () => {
    const { svc, create } = makeService();
    svc.record({ source: "", message: "boom" });
    await Promise.resolve();
    expect(dataOf(create).source).toBe("unknown");
  });

  it("truncates an oversized message and stack so one error cannot bloat the table", async () => {
    const { svc, create } = makeService();
    svc.record({ source: "api", message: "x".repeat(5_000), stack: "y".repeat(50_000) });
    await Promise.resolve();
    const data = dataOf(create);
    expect(data.message).toHaveLength(2_000 + "… [truncated]".length);
    expect(data.stack).toHaveLength(20_000 + "… [truncated]".length);
  });

  it("ignores a non-finite status code", async () => {
    const { svc, create } = makeService();
    svc.record({ source: "api", message: "boom", statusCode: Number.NaN });
    await Promise.resolve();
    expect(dataOf(create).statusCode).toBeNull();
  });

  it("writes JsonNull rather than undefined when there is no context", async () => {
    const { svc, create } = makeService();
    svc.record({ source: "api", message: "boom" });
    await Promise.resolve();
    expect(dataOf(create).context).toBe(Prisma.JsonNull);
  });

  // The whole point of the service: it runs on an error path, so it must never add a
  // second failure. A DB that is down is very often WHY we are recording an error.
  it("swallows a failing write instead of throwing at the caller", async () => {
    const create = jest.fn().mockRejectedValue(new Error("db is down"));
    const { svc } = makeService(create);
    expect(() => svc.record({ source: "api", message: "boom" })).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
