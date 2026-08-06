import { NationBuilderConnector, personName, personPhone, resolveNextUrl } from "./nation-builder.connector";
import { NationBuilderClient } from "./nation-builder.client";
import { IntegrationAuthError, IntegrationConnectionError } from "./integration.errors";

/** Config stub: fast throttle so specs don't sit in the rate limiter's queue. */
const fastConfig = {
  get: (key: string) => (key === "NATION_BUILDER_REQUEST_RATE_PER_SECOND" ? "50" : undefined),
} as any;

describe("NationBuilderConnector", () => {
  const connector = new NationBuilderConnector(fastConfig, new NationBuilderClient(fastConfig));
  const BASE = "https://riverside.nationbuilder.com";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const jsonResponse = (body: unknown, status = 200, headers?: Record<string, string>) =>
    ({
      ok: status < 400,
      status,
      headers: { get: (name: string) => headers?.[name.toLowerCase()] ?? null },
      json: async () => body,
    }) as unknown as Response;

  it("requires a nation base URL — there is no platform-wide default", async () => {
    await expect(connector.testConnection("token")).rejects.toBeInstanceOf(IntegrationConnectionError);
  });

  it("tests connectivity against the lists endpoint with a bearer token", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValue(jsonResponse({ results: [] }));
    await expect(connector.testConnection("token", BASE)).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/api/v1/lists?limit=1`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("maps a 401/403 to an auth error", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue(jsonResponse({}, 401));
    await expect(connector.testConnection("bad", BASE)).rejects.toBeInstanceOf(IntegrationAuthError);
  });

  it("retries a 429 (honouring retry-after) then succeeds — the AN machinery, now here too", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    await expect(connector.testConnection("token", BASE)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("searches lists client-side (NationBuilder has no server-side list search)", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue(
      jsonResponse({
        results: [
          { id: 7, name: "Volunteers", count: 120 },
          { id: 8, name: "Donors", count: 40 },
        ],
        next: null,
      }),
    );
    const lists = await connector.searchLists("token", { query: "vol" }, BASE);
    expect(lists).toEqual([{ id: "7", name: "Volunteers", count: 120, source: "NATION_BUILDER" }]);
  });

  it("browses tags as pullable audiences, prefixing ids so the sync path can route them", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue(
      jsonResponse({
        results: [
          { name: "doorknockers", taggings_count: 88 },
          { name: "donors-2026" },
        ],
        next: null,
      }),
    );
    const tags = await connector.searchLists("token", { kind: "tags" }, BASE);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${BASE}/api/v1/tags?limit=100`);
    expect(tags).toEqual([
      { id: "tag:doorknockers", name: "doorknockers", count: 88, source: "NATION_BUILDER" },
      { id: "tag:donors-2026", name: "donors-2026", count: undefined, source: "NATION_BUILDER" },
    ]);
  });

  it("pages a tag pull through /tags/:tag/people when the listId carries the tag: prefix", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValue(jsonResponse({ results: [], next: null }));
    await connector.syncList("token", { listId: "tag:door knockers" }, BASE);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${BASE}/api/v1/tags/${encodeURIComponent("door knockers")}/people?limit=100`,
    );
  });

  it("follows relative next URLs when syncing, prefers mobile, and KEEPS phone-less people", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: 1, first_name: "Ada", last_name: "Nguyen", mobile: "0412000111", phone: "0299998888" },
            { id: 2, first_name: "Email", last_name: "Only", email: "e@example.org" },
          ],
          next: "/api/v1/lists/7/people?limit=100&__nonce=abc",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 3, first_name: "Lee", phone: "0733334444" }],
          next: null,
        }),
      );

    const result = await connector.syncList("token", { listId: "7", listName: "Volunteers" }, BASE);
    expect(String(fetchMock.mock.calls[1][0])).toBe(`${BASE}/api/v1/lists/7/people?limit=100&__nonce=abc`);
    // The email-only person rides through with phone "" — the service keeps them as a
    // non-contactable audience row instead of dropping them from the import entirely.
    expect(result.contacts.map((c) => c.phone)).toEqual(["0412000111", "", "0733334444"]);
    expect(result.contacts[0].name).toBe("Ada Nguyen");
    expect(result.contacts[1].metadata?.email).toBe("e@example.org");
    expect(result.stats).toMatchObject({
      provider: "NATION_BUILDER",
      listId: "7",
      pagesFetched: 2,
      processedItems: 3,
      returnedContacts: 3,
      skippedNoPhone: 1,
      reasonCounts: { missing_phone_number: 1 },
      nextCursorUrl: null,
    });
  });

  it("carries the person's contactability flags for the opt-out mirror", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue(
      jsonResponse({
        results: [{ id: 9, mobile: "0400000009", do_not_call: true, mobile_opt_in: false }],
        next: null,
      }),
    );
    const result = await connector.syncList("token", { listId: "7" }, BASE);
    const nb = result.contacts[0].metadata?.nationBuilder as Record<string, unknown>;
    expect(nb.do_not_call).toBe(true);
    expect(nb.mobile_opt_in).toBe(false);
  });

  it("resumes from a checkpoint cursor URL instead of page one", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValue(jsonResponse({ results: [], next: null }));
    const cursor = `${BASE}/api/v1/lists/7/people?limit=100&__nonce=resume`;
    await connector.syncList("token", { listId: "7", cursorUrl: cursor }, BASE);
    expect(String(fetchMock.mock.calls[0][0])).toBe(cursor);
  });

  it("samples at most one page and ten contacts", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue(
      jsonResponse({
        results: Array.from({ length: 30 }, (_, i) => ({ id: i, first_name: `P${i}`, mobile: `04000000${i}` })),
        next: "/api/v1/lists/7/people?limit=100&__nonce=more",
      }),
    );
    const sample = await connector.sampleListContacts("token", "7", BASE);
    expect(sample).toHaveLength(10);
  });
});

describe("nation-builder helpers", () => {
  it("resolveNextUrl resolves relative paths against the nation and drops junk", () => {
    expect(resolveNextUrl("https://riverside.nationbuilder.com", "/api/v1/lists?page=2")).toBe(
      "https://riverside.nationbuilder.com/api/v1/lists?page=2",
    );
    expect(resolveNextUrl("https://riverside.nationbuilder.com", null)).toBeUndefined();
    expect(resolveNextUrl("https://riverside.nationbuilder.com", "  ")).toBeUndefined();
  });

  it("personPhone prefers mobile; personName joins and trims", () => {
    expect(personPhone({ mobile: " 0412 ", phone: "02" })).toBe("0412");
    expect(personPhone({ phone: "02" })).toBe("02");
    expect(personPhone({})).toBe("");
    expect(personName({ first_name: "Ada", last_name: "Nguyen" })).toBe("Ada Nguyen");
    expect(personName({ first_name: " ", last_name: "" })).toBeUndefined();
  });
});
