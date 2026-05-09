import { InternalSourceConnector } from "./internal-source.connector";

describe("InternalSourceConnector", () => {
  const connector = new InternalSourceConnector();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("syncs contacts from internal endpoint", async () => {
    jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: "c1", name: "Alice", phone: "+15551234567", tier: "Gold" },
      ],
    } as Response);

    const result = await connector.syncList(
      "key",
      { listId: "list_1" },
      "https://internal.example.com",
    );
    const contacts = result.contacts;
    expect(contacts).toHaveLength(1);
    expect(contacts[0].phone).toBe("+15551234567");
    expect(result.stats.processedItems).toBe(1);
  });
});
