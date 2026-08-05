import { NationBuilderConnector, personName, personPhone, resolveNextUrl } from "./nation-builder.connector";
import { IntegrationAuthError, IntegrationConnectionError } from "./integration.errors";

describe("NationBuilderConnector", () => {
  const connector = new NationBuilderConnector({ get: () => undefined } as any);
  const BASE = "https://riverside.nationbuilder.com";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const jsonResponse = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body }) as Response;

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

  it("follows relative next URLs when syncing and prefers the mobile number", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch" as any)
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: 1, first_name: "Ada", last_name: "Nguyen", mobile: "0412000111", phone: "0299998888" },
            { id: 2, first_name: "No", last_name: "Phone" },
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
    expect(result.contacts.map((c) => c.phone)).toEqual(["0412000111", "0733334444"]);
    expect(result.contacts[0].name).toBe("Ada Nguyen");
    expect(result.stats).toMatchObject({
      provider: "NATION_BUILDER",
      listId: "7",
      pagesFetched: 2,
      processedItems: 3,
      returnedContacts: 2,
      skippedNoPhone: 1,
      reasonCounts: { missing_phone_number: 1 },
      nextCursorUrl: null,
    });
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
