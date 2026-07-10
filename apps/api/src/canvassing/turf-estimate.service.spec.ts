import { INLINE_BUILDING_CAP, TurfEstimateService, hashGeometry } from "./turf-estimate.service";
import { ApiHttpException } from "../common/http/api-response";

/** `n` doors, `gapM` apart along a street. */
const doorsOf = (n: number, gapM = 20) => {
  const lat = -37.8;
  const degPerM = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => ({ id: `d${i}`, lat, lng: 144.96 + i * gapM * degPerM }));
};

function svcWith(opts: {
  doors?: Array<{ id: string; lat: number; lng: number }>;
  turf?: unknown;
  directionsEnabled?: boolean;
  priced?: { seconds: number; metres: number; requests: number } | null;
}) {
  const upsert = jest.fn(async ({ create }: { create: unknown }) => create);
  const prisma = {
    turf: {
      findFirst: jest.fn(async () =>
        "turf" in opts ? opts.turf : { id: "turf1", geometry: { type: "Polygon" } },
      ),
    },
    contact: { findMany: jest.fn(async () => opts.doors ?? []) },
    turfEstimate: { upsert, findFirst: jest.fn(async () => null) },
  };
  const directions = {
    enabled: opts.directionsEnabled ?? false,
    priceRoute: jest.fn(async () => opts.priced ?? null),
  };
  const queue = { enqueue: jest.fn(async () => ({ jobId: "j1", queued: true })) };
  return {
    svc: new TurfEstimateService(prisma as never, directions as never, queue as never),
    prisma,
    directions,
    queue,
    upsert,
  };
}

describe("TurfEstimateService", () => {
  it("throws when the turf is not this tenant's", async () => {
    const { svc } = svcWith({ turf: null });
    await expect(svc.refresh("t1", "nope")).rejects.toBeInstanceOf(ApiHttpException);
  });

  it("stores zeroes for a turf with no doors, so the UI can say 'no doors' not 'not priced'", async () => {
    const { svc, upsert } = svcWith({ doors: [] });
    const est = await svc.refresh("t1", "turf1");
    expect(est).toMatchObject({ doors: 0, buildings: 0, doorsPerHour: 0, source: "crowflies" });
    expect(upsert).toHaveBeenCalled();
  });

  it("prices with straight lines when there is no Mapbox token, and says so", async () => {
    const { svc, directions } = svcWith({ doors: doorsOf(30), directionsEnabled: false });
    const est = await svc.refresh("t1", "turf1");

    expect(est.source).toBe("crowflies");
    expect(est.requests).toBe(0);
    expect(est.walkSeconds).toBeGreaterThan(0);
    expect(directions.priceRoute).not.toHaveBeenCalled();
  });

  it("prices with Mapbox when a token exists, and records the request count", async () => {
    const { svc, directions } = svcWith({
      doors: doorsOf(30),
      directionsEnabled: true,
      priced: { seconds: 900, metres: 1100, requests: 2 },
    });
    const est = await svc.refresh("t1", "turf1");

    expect(est.source).toBe("directions");
    expect(est.walkSeconds).toBe(900);
    expect(est.requests).toBe(2);
    expect(directions.priceRoute).toHaveBeenCalledTimes(1);
  });

  it("falls back to straight lines when Mapbox fails — never a silent zero walk", async () => {
    const { svc } = svcWith({ doors: doorsOf(30), directionsEnabled: true, priced: null });
    const est = await svc.refresh("t1", "turf1");

    expect(est.source).toBe("crowflies");
    expect(est.walkSeconds).toBeGreaterThan(0);
  });

  it("refuses a turf too large to order inside a request, and says to split it", async () => {
    const { svc, directions } = svcWith({ doors: doorsOf(INLINE_BUILDING_CAP + 1, 12) });

    // Nest's HttpException hides the real message in the response body.
    const err = await svc.refresh("t1", "turf1").catch((e: ApiHttpException) => e);
    expect(err).toBeInstanceOf(ApiHttpException);
    const body = (err as ApiHttpException).getResponse() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("TURF_TOO_LARGE_TO_ESTIMATE");
    expect(body.error.message).toMatch(/Split it/);
    // And it spends no API quota discovering that.
    expect(directions.priceRoute).not.toHaveBeenCalled();
  }, 20_000);

  it("prices an oversized turf when a job forces it", async () => {
    const { svc } = svcWith({ doors: doorsOf(INLINE_BUILDING_CAP + 1, 12) });
    const est = await svc.refresh("t1", "turf1", { force: true });
    expect(est.buildings).toBe(INLINE_BUILDING_CAP + 1);
  }, 30_000);

  it("only asks for geocoded doors", async () => {
    const { svc, prisma } = svcWith({ doors: doorsOf(3) });
    await svc.refresh("t1", "turf1");
    const [args] = prisma.contact.findMany.mock.calls[0] as unknown as [{ where: unknown }];
    expect(args.where).toMatchObject({
      tenantId: "t1",
      turfId: "turf1",
      lat: { not: null },
      lng: { not: null },
    });
  });

  it("costs ceil((B-1)/24) Directions requests, before spending any", () => {
    const { svc } = svcWith({});
    expect(svc.requestCost(25)).toBe(1);
    expect(svc.requestCost(26)).toBe(2);
    expect(svc.requestCost(28_580)).toBe(Math.ceil(28_579 / 24)); // Kew
  });
});

describe("TurfEstimateService.requestRefresh", () => {
  it("prices a small turf inline, and queues nothing", async () => {
    const { svc, queue } = svcWith({ doors: doorsOf(20) });
    const res = await svc.requestRefresh("t1", "turf1");
    expect(res.queued).toBe(false);
    expect(res.estimate).toMatchObject({ doors: 20 });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("hands an oversized turf to the worker rather than refusing it", async () => {
    const { svc, queue } = svcWith({ doors: doorsOf(INLINE_BUILDING_CAP + 1, 12) });
    const res = await svc.requestRefresh("t1", "turf1");

    expect(res).toEqual({ queued: true, estimate: null });
    const [job] = queue.enqueue.mock.calls[0] as unknown as [
      { id: string; queue: string; removeOnComplete: boolean; payload: unknown },
    ];
    expect(job.queue).toBe("turf-estimate");
    expect(job.id).toBe("turf-estimate_turf1");
    // Without this, BullMQ keeps the finished job and a re-cut never re-prices.
    expect(job.removeOnComplete).toBe(true);
    expect(job.payload).toEqual({ tenantId: "t1", turfId: "turf1" });
  }, 20_000);

  it("does not swallow a real error", async () => {
    const { svc, queue } = svcWith({ turf: null });
    await expect(svc.requestRefresh("t1", "nope")).rejects.toBeInstanceOf(ApiHttpException);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe("TurfEstimateService.processEstimateJob", () => {
  it("forces past the size cap — that is what a job is for", async () => {
    const { svc } = svcWith({ doors: doorsOf(INLINE_BUILDING_CAP + 1, 12) });
    const est = await svc.processEstimateJob({ tenantId: "t1", turfId: "turf1" });
    expect(est).toMatchObject({ buildings: INLINE_BUILDING_CAP + 1 });
  }, 30_000);

  it("gives up quietly on a turf deleted mid-run, rather than retrying forever", async () => {
    const { svc } = svcWith({ turf: null });
    expect(await svc.processEstimateJob({ tenantId: "t1", turfId: "gone" })).toBeNull();
  });
});

describe("hashGeometry", () => {
  it("changes when the shape changes, so a re-cut invalidates the price", () => {
    const a = hashGeometry({ type: "Polygon", coordinates: [[[0, 0]]] });
    const b = hashGeometry({ type: "Polygon", coordinates: [[[0, 1]]] });
    expect(a).not.toBe(b);
  });

  it("is stable, so renaming a turf does not throw away 1,191 requests of work", () => {
    const g = { type: "Polygon", coordinates: [[[0, 0], [1, 1]]] };
    expect(hashGeometry(g)).toBe(hashGeometry({ ...g }));
  });

  it("handles a turf with no geometry", () => {
    expect(hashGeometry(null)).toBe(hashGeometry(undefined));
  });
});
