import { createHmac } from "node:crypto";
import {
  drainLevel,
  isWorthStoring,
  parseDrainBody,
  toLogRows,
  verifyDrainSignature,
  type VercelDrainEntry,
} from "./vercel-drain";

const SECRET = "drain-secret";
const sign = (body: string) => createHmac("sha1", SECRET).update(Buffer.from(body, "utf8")).digest("hex");

const entry = (over: Partial<VercelDrainEntry> = {}): VercelDrainEntry => ({
  id: "e1",
  message: "Something failed",
  timestamp: Date.parse("2026-08-07T01:00:00.000Z"),
  type: "stdout",
  source: "lambda",
  projectName: "uprise-admin",
  deploymentId: "dpl_1",
  requestId: "req_1",
  level: "error",
  ...over,
});

describe("verifyDrainSignature", () => {
  it("accepts a correct HMAC-SHA1 over the raw body", () => {
    const body = '[{"id":"1"}]';
    expect(verifyDrainSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it("rejects a body that has been altered by even one byte", () => {
    const body = '[{"id":"1"}]';
    const signature = sign(body);
    expect(verifyDrainSignature(Buffer.from('[{"id":"2"}]'), signature, SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const body = '[{"id":"1"}]';
    const other = createHmac("sha1", "wrong").update(body).digest("hex");
    expect(verifyDrainSignature(Buffer.from(body), other, SECRET)).toBe(false);
  });

  // The route is public-allowlisted, so the signature is the ONLY protection. An unconfigured
  // secret must refuse, never wave traffic through.
  it("fails closed when the secret, signature or body is missing", () => {
    const body = '[{"id":"1"}]';
    expect(verifyDrainSignature(Buffer.from(body), sign(body), undefined)).toBe(false);
    expect(verifyDrainSignature(Buffer.from(body), sign(body), "")).toBe(false);
    expect(verifyDrainSignature(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifyDrainSignature(undefined, sign(body), SECRET)).toBe(false);
  });

  // timingSafeEqual throws on a length mismatch, which would itself be a signal.
  it("rejects a wrong-length signature without throwing", () => {
    const body = '[{"id":"1"}]';
    expect(() => verifyDrainSignature(Buffer.from(body), "short", SECRET)).not.toThrow();
    expect(verifyDrainSignature(Buffer.from(body), "short", SECRET)).toBe(false);
  });

  it("accepts a string body as well as a Buffer", () => {
    const body = '[{"id":"1"}]';
    expect(verifyDrainSignature(body, sign(body), SECRET)).toBe(true);
  });
});

describe("parseDrainBody", () => {
  it("parses the json array format", () => {
    expect(parseDrainBody('[{"id":"a"},{"id":"b"}]')).toHaveLength(2);
  });

  it("parses the ndjson format", () => {
    expect(parseDrainBody('{"id":"a"}\n{"id":"b"}\n')).toHaveLength(2);
  });

  // Vercel retries a non-2xx delivery in full, so one bad line must not cost the batch.
  it("skips a malformed ndjson line and keeps the rest", () => {
    const rows = parseDrainBody('{"id":"a"}\nnot json\n{"id":"b"}');
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns empty for blank or unparseable input rather than throwing", () => {
    expect(parseDrainBody("")).toEqual([]);
    expect(parseDrainBody("   ")).toEqual([]);
    expect(parseDrainBody("[not json")).toEqual([]);
  });
});

describe("drainLevel", () => {
  it("maps Vercel's vocabulary", () => {
    expect(drainLevel(entry({ level: "error" }))).toBe("error");
    expect(drainLevel(entry({ level: "warning" }))).toBe("warn");
    expect(drainLevel(entry({ level: "info" }))).toBe("info");
  });

  // An uncaught throw in a Next route handler usually arrives as stderr with no level.
  it("treats stderr with no level as an error", () => {
    expect(drainLevel({ type: "stderr" })).toBe("error");
  });
});

describe("isWorthStoring", () => {
  // A drain is a firehose. Storing all of it in the database you reach for when that database is
  // misbehaving is expensive and circular — the same reason the DomainLogger sink is warn/error.
  it("keeps warn and error, drops info", () => {
    expect(isWorthStoring(entry({ level: "error" }))).toBe(true);
    expect(isWorthStoring(entry({ level: "warning" }))).toBe(true);
    expect(isWorthStoring(entry({ level: "info" }))).toBe(false);
  });

  it("keeps a 5xx even when it reports at info level", () => {
    expect(isWorthStoring(entry({ level: "info", statusCode: 500 }))).toBe(true);
    expect(isWorthStoring(entry({ level: "info", proxy: { statusCode: 502 } }))).toBe(true);
  });

  it("drops a successful request", () => {
    expect(isWorthStoring(entry({ level: "info", statusCode: 200 }))).toBe(false);
    expect(isWorthStoring(entry({ level: "info", proxy: { statusCode: 404 } }))).toBe(false);
  });
});

describe("toLogRows", () => {
  it("shapes an entry into a LogEvent row with request context", () => {
    const [row] = toLogRows([entry({ statusCode: 500, path: "/audience" })], 100);
    expect(row).toMatchObject({
      service: "uprise-admin",
      domain: "vercel:lambda",
      level: "error",
      message: "Something failed",
    });
    expect(row.context).toMatchObject({
      requestId: "req_1",
      deploymentId: "dpl_1",
      path: "/audience",
      statusCode: 500,
    });
    expect(row.at.toISOString()).toBe("2026-08-07T01:00:00.000Z");
  });

  it("drops entries that are not worth storing", () => {
    expect(toLogRows([entry({ level: "info", statusCode: 200 })], 100)).toEqual([]);
  });

  // If the line DID come from a Nest app on Vercel it still carries `[domain] message {json}`.
  it("recovers DomainLogger structure when the line has it", () => {
    const [row] = toLogRows(
      [entry({ message: '[Nest] 1  - 08/07/2026, 1:00:00 AM   ERROR [UpriseApi] [integrations] Sync failed {"syncJobId":"j1"}' })],
      100,
    );
    expect(row.domain).toBe("integrations");
    expect(row.message).toBe("Sync failed");
    expect(row.context).toMatchObject({ syncJobId: "j1" });
  });

  it("falls back to a vercel: domain when there is no DomainLogger prefix", () => {
    const [row] = toLogRows([entry({ source: "edge", message: "boom" })], 100);
    expect(row.domain).toBe("vercel:edge");
  });

  // A burst must not become an unbounded insert.
  it("caps the number of rows", () => {
    const many = Array.from({ length: 50 }, (_, i) => entry({ id: `e${i}` }));
    expect(toLogRows(many, 10)).toHaveLength(10);
  });

  it("truncates a very long message", () => {
    const [row] = toLogRows([entry({ message: "x".repeat(20_000) })], 10);
    expect(row.message.length).toBe(8_000);
  });

  it("survives an entry with almost nothing on it", () => {
    const [row] = toLogRows([{ type: "stderr" }], 10);
    expect(row.service).toBe("vercel");
    expect(row.level).toBe("error");
    expect(row.message).toBe("");
  });
});
