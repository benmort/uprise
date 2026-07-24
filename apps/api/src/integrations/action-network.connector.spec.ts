import { ActionNetworkConnector } from "./action-network.connector";
import {
  IntegrationAuthError,
  IntegrationConnectionError,
} from "./integration.errors";

describe("ActionNetworkConnector", () => {
  // All config keys fall through to their defaults (per_page defaults to 25 —
  // Action Network's hard cap; it 403s anything higher).
  const connector = new ActionNetworkConnector({
    get: () => undefined,
  } as any);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("defaults to per_page=25 — Action Network 403s larger pages", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ _embedded: { "osdi:items": [] } }),
    } as Response);

    await connector.syncList("key", { listId: "list_1" });
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain("/lists/list_1/items?per_page=25");
  });

  it("searches remote lists", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          "osdi:lists": [{ id: "list_1", title: "Main List", total_records: 100 }],
        },
      }),
    } as Response);

    const lists = await connector.searchLists("key", { query: "main" });
    expect(lists[0].id).toBe("list_1");
    expect(lists[0].name).toBe("Main List");
    expect(lists[0].count).toBe(100);
  });

  it("syncs list people across paginated pages", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockImplementation(async (...args: any[]) => {
      const url = String(args[0]);
      if (url.includes("/lists/list_1/items?per_page=25&page=2")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:items": [
                {
                  _embedded: {
                    "osdi:person": {
                      identifiers: ["action_network:person_2"],
                      given_name: "Grace",
                      family_name: "Hopper",
                      phone_numbers: [{ number: "+61400000002" }],
                    },
                  },
                },
              ],
            },
            _links: {},
          }),
        } as Response;
      }
      if (url.includes("/lists/list_1/items?per_page=25")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:items": [
                {
                  _embedded: {
                    "osdi:person": {
                      identifiers: ["action_network:person_1"],
                      given_name: "Ada",
                      family_name: "Lovelace",
                      phone_numbers: [{ number: "+61400000001" }],
                    },
                  },
                },
              ],
            },
            _links: {
              next: {
                href: "https://actionnetwork.org/api/v2/lists/list_1/items?per_page=25&page=2",
              },
            },
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response;
    });

    const result = await connector.syncList("key", { listId: "action_network:list_1" });
    const contacts = result.contacts;

    const peopleCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/lists/list_1/items"));
    expect(peopleCalls).toHaveLength(2);
    expect(peopleCalls[0]).toContain("/lists/list_1/items?per_page=25");
    expect(contacts).toHaveLength(2);
    expect(contacts[0]?.name).toBe("Ada Lovelace");
    expect(contacts[0]?.phone).toBe("+61400000001");
    expect(contacts[1]?.name).toBe("Grace Hopper");
    expect(contacts[1]?.phone).toBe("+61400000002");
    expect(result.stats.processedItems).toBe(2);
    expect(result.stats.returnedContacts).toBe(2);
  });

  it("hydrates people from osdi:person links when items omit embedded people", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockImplementation(async (...args: any[]) => {
      const url = String(args[0]);
      if (url.includes("/lists/list_1/items?per_page=25")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:items": [
                {
                  _links: {
                    "osdi:person": { href: "https://actionnetwork.org/api/v2/people/person_1" },
                  },
                  "action_network:person_id": "person_1",
                  identifiers: ["action_network:person_1"],
                },
                {
                  _links: {
                    "osdi:person": { href: "https://actionnetwork.org/api/v2/people/person_2" },
                  },
                  "action_network:person_id": "person_2",
                  identifiers: ["action_network:person_2"],
                },
              ],
            },
            _links: {},
          }),
        } as Response;
      }
      if (url.includes("/people?per_page=25&filter=")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:people": [
                {
                  identifiers: ["action_network:person_1"],
                  given_name: "Ada",
                  family_name: "Lovelace",
                  phone_numbers: [{ number: "+61400000001" }],
                  _links: {
                    self: { href: "https://actionnetwork.org/api/v2/people/person_1" },
                  },
                },
                {
                  identifiers: ["action_network:person_2"],
                  given_name: "Grace",
                  family_name: "Hopper",
                  phone_numbers: [{ number: "+61400000002" }],
                  _links: {
                    self: { href: "https://actionnetwork.org/api/v2/people/person_2" },
                  },
                },
              ],
            },
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response;
    });

    const result = await connector.syncList("key", { listId: "list_1" });
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0]?.name).toBe("Ada Lovelace");
    expect(result.contacts[0]?.phone).toBe("+61400000001");
    expect(result.contacts[1]?.name).toBe("Grace Hopper");
    expect(result.contacts[1]?.phone).toBe("+61400000002");

    const peopleQueryCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/people?per_page=25&filter="));
    expect(peopleQueryCalls).toHaveLength(1);
    expect(peopleQueryCalls[0]).toContain("identifier%20eq%20'action_network%3Aperson_1'");
    expect(peopleQueryCalls[0]).toContain("identifier%20eq%20'action_network%3Aperson_2'");
  });

  it("uses custom field mobile fallbacks when phone_numbers are missing", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          "osdi:items": [
            {
              _embedded: {
                "osdi:person": {
                  identifiers: ["action_network:person_mobile_1"],
                  given_name: "Taylor",
                  custom_fields: {
                    "Mobile Number": "61411122233",
                  },
                },
              },
            },
            {
              _embedded: {
                "osdi:person": {
                  identifiers: ["action_network:person_mobile_2"],
                  given_name: "Jordan",
                  custom_fields: {
                    phone: "1 (202) 555-1212",
                  },
                },
              },
            },
            {
              _embedded: {
                "osdi:person": {
                  identifiers: ["action_network:person_mobile_3"],
                  given_name: "NoPhone",
                },
              },
            },
          ],
        },
        _links: {},
      }),
    } as Response);

    const result = await connector.syncList("key", { listId: "list_1", listName: "Main list" });
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts[0]?.phone).toBe("+61411122233");
    expect(result.contacts[1]?.phone).toBe("+12025551212");
    expect(result.contacts[2]?.phone).toBe("");
    expect((result.contacts[2]?.metadata as Record<string, unknown>)?.contactable).toBe(false);
    expect(result.stats.skippedNoPhone).toBe(1);
    expect(result.stats.reasonCounts.missing_phone_number).toBe(1);
  });

  it("resolves list ids from self links, identifiers, names and malformed urls", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          "osdi:lists": [
            {
              // id resolved from the self link URL (URL parsing branch)
              _links: { self: { href: "https://actionnetwork.org/api/v2/lists/list_from_self" } },
              title: "From Self",
            },
            {
              // no id / self → falls back to identifiers (array), stripping the prefix
              identifiers: ["action_network:list_ident"],
              name: "From Ident",
            },
            {
              // no id / self / identifiers → falls back to the name
              name: "Only Name",
            },
            {
              // identifiers as a bare string exercises firstString's string branch
              identifiers: "action_network:string_ident",
              title: "String Ident",
            },
            {
              // malformed self URL → normalize catch returns the raw value
              _links: { self: { href: "https://" } },
              title: "Bad Url",
            },
          ],
        },
      }),
    } as Response);

    const lists = await connector.searchLists("key", { query: "" });
    expect(lists.map((l) => l.id)).toEqual([
      "list_from_self",
      "list_ident",
      "Only Name",
      "string_ident",
      "https://",
    ]);
    expect(lists[2].name).toBe("Only Name");
  });

  it("follows and repairs malformed next links, then stops on an unparseable one", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockImplementation(async (...args: any[]) => {
      const url = String(args[0]);
      if (url.includes("?page=2")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:items": [
                {
                  _embedded: {
                    "osdi:person": {
                      identifiers: ["action_network:person_2"],
                      given_name: "Grace",
                      family_name: "Hopper",
                      phone_numbers: [{ number: "+61400000002" }],
                    },
                  },
                },
              ],
            },
            // next link that cannot be parsed → nextLinkHref returns undefined → loop ends
            _links: { next: { href: "https://" } },
          }),
        } as Response;
      }
      if (url.includes("/lists/list_1/items")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:items": [
                {
                  _embedded: {
                    "osdi:person": {
                      identifiers: ["action_network:person_1"],
                      given_name: "Ada",
                      family_name: "Lovelace",
                      phone_numbers: [{ number: "+61400000001" }],
                    },
                  },
                },
              ],
            },
            // malformed next link: query fragment appended to the path with "&"
            _links: { next: { href: "/lists/list_1/items&per_page=25?page=2" } },
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const result = await connector.syncList("key", { listId: "list_1" });
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0]?.name).toBe("Ada Lovelace");
    expect(result.contacts[1]?.name).toBe("Grace Hopper");
    expect(result.stats.pagesFetched).toBe(2);
    // next cursor is null because the final next link was unparseable
    expect(result.stats.nextCursorUrl).toBeNull();

    const page2Calls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("?page=2"));
    expect(page2Calls).toHaveLength(1);
    // the "&"-appended query fragment was moved back into the search params
    expect(page2Calls[0]).toContain("per_page=25");
    expect(page2Calls[0]).not.toContain("items&per_page");
  });

  it("hydrates people via the identifier batch, resolving ids from links and href fallbacks", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockImplementation(async (...args: any[]) => {
      const url = String(args[0]);
      if (url.includes("/people?per_page=25&filter=")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:people": [
                {
                  // no identifiers → person id resolved from the self link (URL branch)
                  name: "Solo Name",
                  phone_numbers: [{ number: "+61400000021" }],
                  _links: { self: { href: "https://actionnetwork.org/api/v2/people/pA" } },
                },
                {
                  identifiers: ["action_network:pB"],
                  given_name: "Grace",
                  family_name: "Hopper",
                  phone_numbers: [{ number: "+61400000022" }],
                },
              ],
            },
          }),
        } as Response;
      }
      if (url.includes("/lists/list_1/items")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:items": [
                // id resolved from item identifiers
                { identifiers: ["action_network:pA"] },
                // id resolved from an osdi:person link href (URL parsing branch)
                { _links: { "osdi:person": { href: "https://actionnetwork.org/api/v2/people/pB" } } },
                // href that throws on URL parse → normalize catch returns raw value; person not found
                { _links: { "osdi:person": { href: "https://" } } },
              ],
            },
            _links: {},
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const result = await connector.syncList("key", { listId: "list_1" });
    expect(result.contacts).toHaveLength(3);
    // person with only a `name` field uses the full-name fallback
    expect(result.contacts[0]?.name).toBe("Solo Name");
    expect(result.contacts[0]?.phone).toBe("+61400000021");
    expect(result.contacts[1]?.name).toBe("Grace Hopper");
    expect(result.contacts[1]?.phone).toBe("+61400000022");
    // third item's person could not be resolved → skipped as no-phone
    expect(result.contacts[2]?.phone).toBe("");
    expect(result.stats.skippedNoPhone).toBe(1);

    const batchCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/people?per_page=25&filter="));
    expect(batchCalls).toHaveLength(1);
  });

  it("hydrates people by following osdi:person links, reusing the per-href cache", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockImplementation(async (...args: any[]) => {
      const url = String(args[0]);
      // person follow-link fetch (href fallback path)
      if (url.includes("action_network:")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            identifiers: ["action_network:href_person"],
            given_name: "Href",
            family_name: "Person",
            phone_numbers: [{ number: "+61400000031" }],
          }),
        } as Response;
      }
      if (url.includes("/lists/list_1/items")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:items": [
                // href normalises to an empty person id → hydrated via the follow-link path
                { _links: { "osdi:person": { href: "action_network:" } } },
                // same href → resolved from the per-href cache (single network call)
                { _links: { "osdi:person": { href: "action_network:" } } },
                // empty href → no id and no follow link → contact stays unresolved
                { _links: { "osdi:person": { href: "" } } },
              ],
            },
            _links: {},
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const result = await connector.syncList("key", { listId: "list_1" });
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts[0]?.name).toBe("Href Person");
    expect(result.contacts[0]?.phone).toBe("+61400000031");
    expect(result.contacts[1]?.phone).toBe("+61400000031");
    expect(result.contacts[2]?.phone).toBe("");
    expect(result.stats.skippedNoPhone).toBe(1);

    // both items shared one href → the person was fetched exactly once (cache reuse)
    const personCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("action_network:"));
    expect(personCalls).toHaveLength(1);
  });

  it("skips contacts whose osdi:person follow link 404s", async () => {
    jest.spyOn(global, "fetch" as any).mockImplementation(async (...args: any[]) => {
      const url = String(args[0]);
      if (url.includes("action_network:")) {
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }
      if (url.includes("/lists/list_1/items")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              "osdi:items": [{ _links: { "osdi:person": { href: "action_network:" } } }],
            },
            _links: {},
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const result = await connector.syncList("key", { listId: "list_1" });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]?.phone).toBe("");
    expect(result.stats.skippedNoPhone).toBe(1);
    expect(result.stats.reasonCounts.missing_phone_number).toBe(1);
  });

  it("selects phones from custom-field regex scans and top-level fields", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          "osdi:items": [
            {
              _embedded: {
                "osdi:person": {
                  identifiers: ["action_network:p1"],
                  given_name: "Custom",
                  // no preferred-key match, but a key matching the phone regex
                  custom_fields: { "Preferred Contact Phone": "+61 400 111 222" },
                },
              },
            },
            {
              _embedded: {
                "osdi:person": {
                  identifiers: ["action_network:p2"],
                  given_name: "TopLevel",
                  // no phone_numbers / custom_fields → top-level field fallback
                  mobile: "+61400222333",
                },
              },
            },
            {
              _embedded: {
                "osdi:person": {
                  identifiers: ["action_network:p3"],
                  given_name: "NoMatch",
                  // custom_fields present but nothing phone-like → returns undefined
                  custom_fields: { favourite_colour: "blue" },
                },
              },
            },
          ],
        },
        _links: {},
      }),
    } as Response);

    const result = await connector.syncList("key", { listId: "list_1" });
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts[0]?.phone).toBe("+61400111222");
    expect(
      (result.contacts[0]?.metadata as Record<string, unknown>)?.phoneSource,
    ).toBe("person_custom_fields");
    expect(result.contacts[1]?.phone).toBe("+61400222333");
    expect(
      (result.contacts[1]?.metadata as Record<string, unknown>)?.phoneSource,
    ).toBe("person_top_level");
    expect(result.contacts[2]?.phone).toBe("");
    expect(result.stats.skippedNoPhone).toBe(1);
  });

  it("samples list contacts, capping the page count", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          "osdi:items": [
            {
              _embedded: {
                "osdi:person": {
                  identifiers: ["action_network:sample_1"],
                  given_name: "Sample",
                  phone_numbers: [{ number: "+61400000041" }],
                },
              },
            },
          ],
        },
        _links: {},
      }),
    } as Response);

    const contacts = await connector.sampleListContacts("key", "list_1");
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.phone).toBe("+61400000041");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("stops before fetching once the run budget is exhausted", async () => {
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(0).mockReturnValue(2_000_000);
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ _embedded: { "osdi:items": [] }, _links: {} }),
    } as Response);

    const result = await connector.syncList("key", { listId: "list_1" });
    expect(result.contacts).toHaveLength(0);
    expect(result.stats.pagesFetched).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies a connection via a lists probe", async () => {
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ _embedded: { "osdi:lists": [] } }),
    } as unknown as Response);

    await expect(connector.testConnection("key")).resolves.toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/lists?per_page=1");
  });

  it("retries retryable statuses (with and without retry-after) then succeeds", async () => {
    jest.spyOn(connector as any, "sleep").mockResolvedValue(undefined);
    const header = (retryAfter: string | null) => ({
      get: (name: string) => (name.toLowerCase() === "retry-after" ? retryAfter : null),
    });
    let call = 0;
    const fetchMock = jest.spyOn(global, "fetch" as any).mockImplementation(async () => {
      call += 1;
      // numeric retry-after (seconds)
      if (call === 1)
        return { ok: false, status: 429, headers: header("0"), json: async () => ({}) } as unknown as Response;
      // unparseable retry-after → falls back to computed backoff
      if (call === 2)
        return { ok: false, status: 503, headers: header("not-a-date"), json: async () => ({}) } as unknown as Response;
      // no retry-after header at all
      if (call === 3)
        return { ok: false, status: 500, headers: header(null), json: async () => ({}) } as unknown as Response;
      // HTTP-date retry-after (in the past → clamps to 0)
      if (call === 4)
        return {
          ok: false,
          status: 503,
          headers: header("Wed, 21 Oct 2015 07:28:00 GMT"),
          json: async () => ({}),
        } as unknown as Response;
      return { ok: true, status: 200, headers: header(null), json: async () => ({ ok: true }) } as unknown as Response;
    });

    await expect(connector.testConnection("key")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("throws IntegrationConnectionError when retryable statuses never recover", async () => {
    jest.spyOn(connector as any, "sleep").mockResolvedValue(undefined);
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => "0" },
      json: async () => ({}),
    } as unknown as Response);

    await expect(connector.testConnection("key")).rejects.toBeInstanceOf(IntegrationConnectionError);
  });

  it("throws immediately on a non-retryable non-OK status", async () => {
    jest.spyOn(connector as any, "sleep").mockResolvedValue(undefined);
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({}),
    } as unknown as Response);

    await expect(connector.testConnection("key")).rejects.toBeInstanceOf(IntegrationConnectionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws IntegrationAuthError when the API key is rejected", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({}),
    } as unknown as Response);

    await expect(connector.testConnection("key")).rejects.toBeInstanceOf(IntegrationAuthError);
  });

  it("wraps repeated network failures in IntegrationConnectionError", async () => {
    jest.spyOn(connector as any, "sleep").mockResolvedValue(undefined);
    jest.spyOn(global, "fetch" as any).mockRejectedValue(new Error("network down"));

    await expect(connector.testConnection("key")).rejects.toBeInstanceOf(IntegrationConnectionError);
  });
});
