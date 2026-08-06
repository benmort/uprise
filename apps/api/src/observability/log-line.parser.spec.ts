import {
  atLeastLevel,
  matchesFilters,
  normaliseLevel,
  parseLogLine,
  splitTrailingJson,
  stripAnsi,
  type LogRecord,
} from "./log-line.parser";

/** A real Railway line, ANSI and all, from the credential-decrypt incident. */
const REAL_ERROR_LINE =
  "[31m[Nest] 1  - [39m08/06/2026, 5:59:28 AM [31m  ERROR[39m " +
  "[38;5;3m[UpriseApi] [39m[31m[integrations] Sync credential could not be decrypted " +
  '{"syncJobId":"cmsh3vvh40001jg0atbdgjpv5","connectionId":"cmsh01wcg0001l704ix2i84qi","type":"ACTION_NETWORK"}[39m';

const base = { source: "railway" as const, service: "worker", at: "2026-08-06T05:59:30.000Z" };

describe("stripAnsi", () => {
  it("removes colour escapes and leaves the text", () => {
    expect(stripAnsi("[31mred[39m")).toBe("red");
    expect(stripAnsi("plain")).toBe("plain");
  });
});

describe("normaliseLevel", () => {
  it("maps Nest's vocabulary onto the four levels", () => {
    expect(normaliseLevel("ERROR")).toBe("error");
    expect(normaliseLevel("FATAL")).toBe("error");
    expect(normaliseLevel("WARN")).toBe("warn");
    expect(normaliseLevel("LOG")).toBe("info");
    expect(normaliseLevel("VERBOSE")).toBe("debug");
    expect(normaliseLevel("debug")).toBe("debug");
  });

  // A provider changing its severity vocabulary must not manufacture alerts.
  it("falls back to info for unknown, empty and absent levels", () => {
    expect(normaliseLevel("SEVERE")).toBe("info");
    expect(normaliseLevel("")).toBe("info");
    expect(normaliseLevel(undefined)).toBe("info");
  });
});

describe("splitTrailingJson", () => {
  it("splits a trailing context object off the message", () => {
    const { message, context } = splitTrailingJson('Sync failed {"jobId":"j1","count":3}');
    expect(message).toBe("Sync failed");
    expect(context).toEqual({ jobId: "j1", count: 3 });
  });

  it("handles nested objects without swallowing the message", () => {
    const { message, context } = splitTrailingJson('Done {"a":{"b":{"c":1}},"d":2}');
    expect(message).toBe("Done");
    expect(context).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });

  // A brace inside a quoted value must not close the object early.
  it("ignores braces inside strings", () => {
    const { message, context } = splitTrailingJson('Parsed {"pattern":"a{b}c","ok":true}');
    expect(message).toBe("Parsed");
    expect(context).toEqual({ pattern: "a{b}c", ok: true });
  });

  it("keeps an escaped quote inside a value", () => {
    const { message, context } = splitTrailingJson('Note {"text":"say \\"hi\\""}');
    expect(message).toBe("Note");
    expect(context).toEqual({ text: 'say "hi"' });
  });

  it("leaves a message that merely ends in a brace alone", () => {
    expect(splitTrailingJson("nothing here }")).toEqual({ message: "nothing here }" });
    expect(splitTrailingJson("not json {oops}")).toEqual({ message: "not json {oops}" });
  });

  it("does not treat a trailing array as context", () => {
    expect(splitTrailingJson("list [1,2,3]")).toEqual({ message: "list [1,2,3]" });
  });

  it("returns the message unchanged when there is no object", () => {
    expect(splitTrailingJson("just a message")).toEqual({ message: "just a message" });
  });
});

describe("parseLogLine", () => {
  // The line that took an hour to find. Everything needed to diagnose it — level, domain and the
  // syncJobId — is recoverable from the text, which is the whole reason for parsing rather than
  // grepping.
  it("recovers level, domain, message and context from a real Nest error line", () => {
    const record = parseLogLine({ ...base, message: REAL_ERROR_LINE });
    expect(record.level).toBe("error");
    expect(record.domain).toBe("integrations");
    expect(record.message).toBe("Sync credential could not be decrypted");
    expect(record.context).toMatchObject({
      syncJobId: "cmsh3vvh40001jg0atbdgjpv5",
      type: "ACTION_NETWORK",
    });
    expect(record.source).toBe("railway");
    expect(record.service).toBe("worker");
  });

  it("parses an info line with an http domain", () => {
    const line =
      '[Nest] 10  - 08/06/2026, 6:02:51 AM    LOG [UpriseApi] [http] GET /api/v1/system/feature-flags {"statusCode":200,"elapsedMs":843}';
    const record = parseLogLine({ ...base, message: line });
    expect(record.level).toBe("info");
    expect(record.domain).toBe("http");
    expect(record.message).toBe("GET /api/v1/system/feature-flags");
    expect(record.context).toEqual({ statusCode: 200, elapsedMs: 843 });
  });

  it("keeps a non-Nest platform line whole and takes the provider's severity", () => {
    const record = parseLogLine({
      ...base,
      message: "GET  ---  api.uprise.org.au     /api/v1/health",
      severity: "error",
    });
    expect(record.level).toBe("error");
    expect(record.domain).toBeUndefined();
    expect(record.message).toContain("api.uprise.org.au");
  });

  it("falls back to the provider timestamp and never throws on junk", () => {
    const record = parseLogLine({ ...base, message: "" });
    expect(record.at).toBe(base.at);
    expect(record.message).toBe("");
    expect(record.level).toBe("info");
  });

  it("retains the ANSI-stripped original as raw", () => {
    const record = parseLogLine({ ...base, message: REAL_ERROR_LINE });
    expect(record.raw).not.toContain("");
    expect(record.raw).toContain("Sync credential could not be decrypted");
  });

  it("handles a Nest line with no domain prefix", () => {
    const record = parseLogLine({
      ...base,
      message: "[Nest] 1  - 08/06/2026, 5:45:15 AM    LOG [InstanceLoader] AppModule dependencies initialized",
    });
    expect(record.level).toBe("info");
    expect(record.message).toBe("AppModule dependencies initialized");
  });
});

describe("atLeastLevel / matchesFilters", () => {
  const record = (over: Partial<LogRecord> = {}): LogRecord => ({
    at: base.at,
    source: "railway",
    service: "worker",
    level: "error",
    message: "Sync credential could not be decrypted",
    domain: "integrations",
    context: { syncJobId: "j1" },
    ...over,
  });

  // `--level warn` meaning "warn and worse" is what every log tool does.
  it("treats a level filter as a floor, not an equality", () => {
    expect(atLeastLevel("error", "warn")).toBe(true);
    expect(atLeastLevel("info", "warn")).toBe(false);
    expect(matchesFilters(record({ level: "error" }), { level: "warn" })).toBe(true);
    expect(matchesFilters(record({ level: "info" }), { level: "warn" })).toBe(false);
  });

  it("filters on domain exactly", () => {
    expect(matchesFilters(record(), { domain: "integrations" })).toBe(true);
    expect(matchesFilters(record(), { domain: "http" })).toBe(false);
  });

  it("searches the message and the context, case-insensitively", () => {
    expect(matchesFilters(record(), { q: "DECRYPT" })).toBe(true);
    expect(matchesFilters(record(), { q: "j1" })).toBe(true); // matched inside context
    expect(matchesFilters(record(), { q: "nothing" })).toBe(false);
  });

  it("passes everything when no filters are given", () => {
    expect(matchesFilters(record({ level: "debug", domain: undefined }), {})).toBe(true);
  });
});
