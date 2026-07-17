const createMock = jest.fn();
jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({ messages: { create: createMock } }));
});

import { CustomQueryService } from "./custom-query.service";

const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;

function setup() {
  const executed: string[] = [];
  const prisma: any = {
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
    $executeRawUnsafe: jest.fn(async (sql: string) => {
      executed.push(sql);
      return 0;
    }),
    $queryRawUnsafe: jest.fn(async () => [{ contact_id: "c1" }, { contact_id: "c2" }]),
  };
  const svc = new CustomQueryService(prisma, logger);
  return { svc, prisma, executed };
}

describe("CustomQueryService — 3-layer containment", () => {
  beforeEach(() => {
    delete process.env.SEGMENT_AI_ENABLED;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("executes a valid predicate under READ ONLY + timeout + the restricted role, tenant-bound", async () => {
    const { svc, prisma, executed } = setup();
    const result = await svc.resolveContacts("t1", "state = 'NSW'");

    expect(result.ok).toBe(true);
    expect(result.contactIds).toEqual(["c1", "c2"]);
    // Containment order: READ ONLY first, then timeout, then the role.
    expect(executed[0]).toBe("SET TRANSACTION READ ONLY");
    expect(executed[1]).toContain("statement_timeout");
    expect(executed[2]).toBe("SET LOCAL ROLE uprise_segment_query_ro");
    // The tenant id is a bind parameter of the executor's envelope.
    const [sql, tenantId] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("tenant_id = $1");
    expect(tenantId).toBe("t1");
  });

  it("refuses an invalid predicate without touching the database", async () => {
    const { svc, prisma } = setup();
    const result = await svc.resolveContacts("t1", "true; drop table x");
    expect(result.ok).toBe(false);
    expect(result.contactIds).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails closed (ok:false + reason) when execution errors (timeout/permission)", async () => {
    const { svc, prisma } = setup();
    prisma.$queryRawUnsafe.mockRejectedValueOnce(new Error("canceling statement due to statement timeout"));
    const result = await svc.resolveContacts("t1", "state = 'NSW'");
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toContain("timeout");
  });

  it("compilePredicate returns null when AI is disabled (no key/flag)", async () => {
    const { svc } = setup();
    expect(await svc.compilePredicate("anyone in NSW")).toBeNull();
  });

  it("compileCustomClause reports unsupported when the AI lane is off", async () => {
    const { svc } = setup();
    const result = await svc.compileCustomClause("t1", "people who love the reef");
    expect(result.status).toBe("unsupported");
    expect(result.predicate).toBeNull();
  });

  describe("with the AI lane enabled (mocked Claude)", () => {
    beforeEach(() => {
      process.env.SEGMENT_AI_ENABLED = "true";
      process.env.ANTHROPIC_API_KEY = "test-key";
      createMock.mockReset();
    });

    it("compileCustomClause: valid predicate → ok + live count", async () => {
      createMock.mockResolvedValueOnce({
        content: [{ type: "text", text: "```sql\nstate = 'NSW'\n```" }],
      });
      const { svc } = setup();
      const result = await svc.compileCustomClause("t1", "anyone in NSW");
      expect(result).toMatchObject({ status: "ok", predicate: "state = 'NSW'", count: 2 });
    });

    it("compileCustomClause: model output failing the AST gate → needs-review, never executed", async () => {
      createMock.mockResolvedValueOnce({
        content: [{ type: "text", text: "true; drop table x" }],
      });
      const { svc, prisma } = setup();
      const result = await svc.compileCustomClause("t1", "sneaky");
      expect(result.status).toBe("needs-review");
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("compileCustomClause: UNSUPPORTED sentinel → unsupported", async () => {
      createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "UNSUPPORTED" }] });
      const { svc } = setup();
      const result = await svc.compileCustomClause("t1", "vibes only");
      expect(result.status).toBe("unsupported");
    });

    it("compilePredicate: returns null on a model error (callers fall back)", async () => {
      createMock.mockRejectedValueOnce(new Error("api down"));
      const { svc } = setup();
      expect(await svc.compilePredicate("x")).toBeNull();
    });
  });
});
