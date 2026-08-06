import { LogEventSink, type LogEventRow } from "./log-event.sink";
import { REDACTED } from "./log-redaction";

/** A writer that records what it was asked to persist, and can be made to fail. */
function writer() {
  const batches: LogEventRow[][] = [];
  let fail = false;
  const fn = jest.fn(async (rows: LogEventRow[]) => {
    if (fail) throw new Error("db down");
    batches.push(rows);
  });
  return {
    fn,
    batches,
    get rows() {
      return batches.flat();
    },
    setFail(v: boolean) {
      fail = v;
    },
  };
}

const flushNow = async (sink: LogEventSink) => {
  await sink.flush();
};

describe("LogEventSink", () => {
  it("stamps the service and persists a queued row on flush", async () => {
    const w = writer();
    const sink = new LogEventSink(w.fn, "worker");
    sink.record({ domain: "integrations", level: "error", message: "boom" });
    await flushNow(sink);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ service: "worker", domain: "integrations", level: "error" });
  });

  it("redacts context on the way in", async () => {
    const w = writer();
    const sink = new LogEventSink(w.fn, "api");
    sink.record({ domain: "d", level: "error", message: "m", context: { id: "keep", apiKey: "sk" } });
    await flushNow(sink);
    expect(w.rows[0].context).toEqual({ id: "keep", apiKey: REDACTED });
  });

  // tenantId is lifted out of context so per-tenant filtering is an index lookup, not a JSON scan.
  it("denormalises tenantId out of context", async () => {
    const w = writer();
    const sink = new LogEventSink(w.fn, "api");
    sink.record({ domain: "d", level: "error", message: "m", context: { tenantId: "t1" } });
    await flushNow(sink);
    expect(w.rows[0].tenantId).toBe("t1");
  });

  // Constraint 1: this runs inside DomainLogger.error, i.e. while something has already failed.
  it("never throws, even when the writer rejects", async () => {
    const w = writer();
    w.setFail(true);
    const sink = new LogEventSink(w.fn, "api");
    expect(() => sink.record({ domain: "d", level: "error", message: "m" })).not.toThrow();
    await expect(sink.flush()).resolves.toBeUndefined();
  });

  it("keeps rows buffered when a flush fails, so the next one retries them", async () => {
    const w = writer();
    w.setFail(true);
    const sink = new LogEventSink(w.fn, "api");
    sink.record({ domain: "d", level: "error", message: "retry me" });
    await flushNow(sink);
    expect(sink.pending).toBe(1);

    w.setFail(false);
    await flushNow(sink);
    expect(w.rows.map((r) => r.message)).toContain("retry me");
    expect(sink.pending).toBe(0);
  });

  // Constraint 3: an unreachable database must not grow the buffer without limit — that is
  // exactly the incident where memory matters most.
  it("caps the buffer, dropping OLDEST rows so the newest errors survive", async () => {
    const w = writer();
    const sink = new LogEventSink(w.fn, "api", { maxBuffer: 3, batchSize: 10 });
    for (let i = 0; i < 6; i += 1) {
      sink.record({ domain: "d", level: "error", message: `m${i}` });
    }
    expect(sink.pending).toBe(3);
    await flushNow(sink);
    const messages = w.rows.map((r) => r.message);
    expect(messages).toContain("m5");
    expect(messages).not.toContain("m0");
  });

  // A gap nobody knows about is worse than a gap that announces itself.
  it("records how many rows it dropped, in-band", async () => {
    const w = writer();
    const sink = new LogEventSink(w.fn, "api", { maxBuffer: 2, batchSize: 10 });
    for (let i = 0; i < 5; i += 1) sink.record({ domain: "d", level: "error", message: `m${i}` });
    await flushNow(sink);
    const notice = w.rows.find((r) => r.domain === "observability");
    expect(notice?.message).toMatch(/dropped 3 buffered rows/);
    expect(notice?.level).toBe("warn");
  });

  it("writes in batches, leaving the remainder queued", async () => {
    const w = writer();
    const sink = new LogEventSink(w.fn, "api", { batchSize: 2, maxBuffer: 100 });
    for (let i = 0; i < 5; i += 1) sink.record({ domain: "d", level: "error", message: `m${i}` });
    await flushNow(sink);
    expect(w.batches[0]).toHaveLength(2);
    expect(sink.pending).toBe(3);
  });

  it("does nothing on an empty flush", async () => {
    const w = writer();
    const sink = new LogEventSink(w.fn, "api");
    await flushNow(sink);
    expect(w.fn).not.toHaveBeenCalled();
  });
});
