import { NationBuilderClient } from "./nation-builder.client";
import { IntegrationAuthError, IntegrationConnectionError } from "./integration.errors";

const configWith = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as any;

/** Fast lane for specs: effectively no throttle wait, standard retry budget. */
const fastClient = () => new NationBuilderClient(configWith({ NATION_BUILDER_REQUEST_RATE_PER_SECOND: "50" }));

const jsonResponse = (body: unknown, status = 200, headers?: Record<string, string>) =>
  ({
    ok: status < 400,
    status,
    headers: { get: (name: string) => headers?.[name.toLowerCase()] ?? null },
    json: async () => body,
  }) as unknown as Response;

describe("NationBuilderClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends the bearer token and parses JSON", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValue(jsonResponse({ ok: 1 }));
    const out = await fastClient().requestJson("https://n.nationbuilder.com/api/v1/x", "tok", "failed");
    expect(out).toEqual({ ok: 1 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("fails fast on 401/403 — a bad token never improves with retries", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue(jsonResponse({}, 403));
    await expect(
      fastClient().requestJson("https://n.nationbuilder.com/api/v1/x", "tok", "failed"),
    ).rejects.toBeInstanceOf(IntegrationAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and 5xx (honouring retry-after) then succeeds", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ done: true }));
    // Retries' computed backoff (500ms · 2^attempt + jitter) only applies when no
    // retry-after is present — the 500 above pays it, so keep the budget at attempt 2.
    const out = await fastClient().requestJson<{ done: boolean }>(
      "https://n.nationbuilder.com/api/v1/x",
      "tok",
      "failed",
    );
    expect(out).toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("gives up after the retry budget with the caller's failure message", async () => {
    const client = new NationBuilderClient(
      configWith({ NATION_BUILDER_REQUEST_RATE_PER_SECOND: "50", NATION_BUILDER_REQUEST_RETRIES: "1" }),
    );
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValue(jsonResponse({}, 429, { "retry-after": "0" }));
    await expect(
      client.requestJson("https://n.nationbuilder.com/api/v1/x", "tok", "list import failed"),
    ).rejects.toBeInstanceOf(IntegrationConnectionError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("does not retry a non-retryable status", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue(jsonResponse({}, 404));
    await expect(
      fastClient().requestJson("https://n.nationbuilder.com/api/v1/x", "tok", "failed"),
    ).rejects.toBeInstanceOf(IntegrationConnectionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a network error then surfaces it as a connection error when exhausted", async () => {
    const client = new NationBuilderClient(
      configWith({ NATION_BUILDER_REQUEST_RATE_PER_SECOND: "50", NATION_BUILDER_REQUEST_RETRIES: "0" }),
    );
    jest.spyOn(global, "fetch" as any).mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      client.requestJson("https://n.nationbuilder.com/api/v1/x", "tok", "failed"),
    ).rejects.toBeInstanceOf(IntegrationConnectionError);
  });

  it("paces requests per host — two nations never share one throttle lane", async () => {
    // 1 req/s ⇒ the SECOND request to the same host must wait ~1s; a different host must not.
    const client = new NationBuilderClient(configWith({ NATION_BUILDER_REQUEST_RATE_PER_SECOND: "1" }));
    jest.spyOn(global, "fetch" as any).mockResolvedValue(jsonResponse({}));
    const started = Date.now();
    await client.requestJson("https://a.nationbuilder.com/api/v1/x", "tok", "failed");
    await client.requestJson("https://b.nationbuilder.com/api/v1/x", "tok", "failed");
    const crossHostMs = Date.now() - started;
    expect(crossHostMs).toBeLessThan(500); // different hosts: no wait between them
    const secondStarted = Date.now();
    await client.requestJson("https://a.nationbuilder.com/api/v1/x", "tok", "failed");
    expect(Date.now() - secondStarted).toBeGreaterThanOrEqual(700); // same host: throttled
  }, 15_000);

  it("parses an HTTP-date retry-after (clamping past dates to zero) and ignores garbage", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      // Past HTTP-date → wait clamps to 0 → immediate retry.
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "Wed, 01 Jan 2020 00:00:00 GMT" }))
      // Unparseable retry-after → computed backoff (attempt 1 ⇒ ~1s) — accept the wait.
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "soonish" }))
      .mockResolvedValueOnce(jsonResponse({ done: true }));
    const out = await fastClient().requestJson<{ done: boolean }>(
      "https://n.nationbuilder.com/api/v1/x",
      "tok",
      "failed",
    );
    expect(out).toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("falls back to the raw string as the throttle key when the URL is malformed", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue(jsonResponse({}));
    // A garbage URL still throttles (keyed on the string itself) and still fetches.
    await expect(fastClient().requestJson("not a url", "tok", "failed")).resolves.toEqual({});
  });

  it("POSTs a JSON body with the content-type header when writes ask for it", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue(jsonResponse({ id: 1 }));
    await fastClient().requestJson("https://n.nationbuilder.com/api/v1/people", "tok", "failed", {
      method: "POST",
      body: { person: { email: "e@example.org" } },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ person: { email: "e@example.org" } });
  });
});
