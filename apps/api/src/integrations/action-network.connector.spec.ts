import { ActionNetworkConnector } from "./action-network.connector";

describe("ActionNetworkConnector", () => {
  // Pin the sync page size to 25 (the size these fixtures were written against);
  // the production default is 95. Other config keys fall through to their defaults.
  const connector = new ActionNetworkConnector({
    get: (key: string) => (key === "ACTION_NETWORK_SYNC_PER_PAGE" ? "25" : undefined),
  } as any);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("searches remote lists", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          "osdi:lists": [{ id: "list_1", title: "Main List", total_donations: 100 }],
        },
      }),
    } as Response);

    const lists = await connector.searchLists("key", { query: "main" });
    expect(lists[0].id).toBe("list_1");
    expect(lists[0].name).toBe("Main List");
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
});
