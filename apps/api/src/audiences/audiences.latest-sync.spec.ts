import { AudiencesService } from "./audiences.service";

/**
 * Which sync job an audience reports as its latest.
 *
 * `orderBy: { completedAt: "desc" }` reads like "most recent sync" and does the opposite in
 * Postgres, where DESC sorts NULLS FIRST. A job that never completed — precisely the stranded
 * QUEUED import this surface exists to make visible — has completedAt NULL and therefore
 * outranked every finished job, permanently: a tenant could sync successfully a dozen times and
 * the audience would still report a months-old stuck import as its latest sync, with its stale
 * counts and its error summary.
 *
 * This pins the ORDER BY rather than the rows, because a mocked findFirst returns whatever it is
 * given — the bug lived entirely in the clause handed to Postgres.
 */
function setup() {
  const prisma: any = {
    audience: {
      findFirst: jest.fn(async () => ({ id: "aud1", tenantId: "t1", _count: { contacts: 3 } })),
    },
    integrationSyncJob: { findFirst: jest.fn(async () => null) },
    audienceContact: { findMany: jest.fn(async () => []) },
    contactConsent: { findMany: jest.fn(async () => []) },
    $queryRaw: jest.fn(async () => []),
  };
  const config: any = { get: (_k: string, d?: unknown) => d };
  return { svc: new AudiencesService(prisma, config), prisma };
}

describe("AudiencesService.getAudience — latest sync", () => {
  it("orders by creation, never by completion", async () => {
    const { svc, prisma } = setup();

    await svc.getAudience("t1", "aud1");

    const orderBy = prisma.integrationSyncJob.findFirst.mock.calls[0][0].orderBy as Array<
      Record<string, unknown>
    >;
    // completedAt must not appear at all: DESC on a nullable column puts the never-completed
    // jobs first in Postgres, which is the whole defect.
    expect(JSON.stringify(orderBy)).not.toContain("completedAt");
    expect(orderBy[0]).toEqual({ createdAt: "desc" });
  });

  it("is deterministic when two jobs share a timestamp", async () => {
    const { svc, prisma } = setup();

    await svc.getAudience("t1", "aud1");

    const orderBy = prisma.integrationSyncJob.findFirst.mock.calls[0][0].orderBy as Array<
      Record<string, unknown>
    >;
    expect(orderBy.length).toBeGreaterThan(1);
    expect(orderBy[1]).toEqual({ id: "desc" });
  });

  it("stays scoped to the tenant and the audience", async () => {
    const { svc, prisma } = setup();

    await svc.getAudience("t1", "aud1");

    expect(prisma.integrationSyncJob.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: "t1",
      audienceId: "aud1",
    });
  });

  // An in-flight sync (created now, not yet completed) is exactly what the card needs on top to
  // show progress — createdAt ordering keeps it there, where a "completed jobs only" fix would
  // have hidden it.
  it("still surfaces a running sync", async () => {
    const { svc, prisma } = setup();
    prisma.integrationSyncJob.findFirst.mockResolvedValue({
      id: "job-running",
      status: "RUNNING",
      syncedCount: 0,
      failedCount: 0,
      remoteListId: null,
      query: null,
      integrationConnectionId: "conn1",
      errorSummary: null,
      completedAt: null,
      createdAt: new Date(),
    });

    const res = await svc.getAudience("t1", "aud1");

    expect(res.latestSync).toMatchObject({ id: "job-running", status: "RUNNING" });
  });
});
