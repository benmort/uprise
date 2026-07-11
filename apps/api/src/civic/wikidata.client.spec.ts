import { WikidataClient, WikidataError } from "./wikidata.client";

const clientWith = (cfg: Record<string, string | undefined>) =>
  new WikidataClient({ get: (k: string) => cfg[k] } as never);

const res = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: new Headers(headers),
  json: async () => body,
});

const CFG: Record<string, string | undefined> = {
  WIKIDATA_SPARQL_URL: "https://wd.test/sparql",
  WIKIDATA_REQUESTS_PER_SECOND: "50",
  WIKIDATA_MAX_RETRIES: "2",
};

describe("WikidataClient", () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it("select builds the endpoint URL, sends a User-Agent, and flattens bindings", async () => {
    fetchMock.mockResolvedValueOnce(
      res(200, {
        results: {
          bindings: [{ person: { value: "http://www.wikidata.org/entity/Q1" }, personLabel: { value: "Alice" } }],
        },
      }),
    );
    const rows = await clientWith(CFG).select("SELECT ?person WHERE {}");
    expect(rows).toEqual([{ person: "http://www.wikidata.org/entity/Q1", personLabel: "Alice" }]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("https://wd.test/sparql?query=");
    expect(url).toContain("format=json");
    expect((opts.headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("returns [] when there are no bindings", async () => {
    fetchMock.mockResolvedValueOnce(res(200, { results: { bindings: [] } }));
    expect(await clientWith(CFG).select("SELECT ...")).toEqual([]);
  });

  it("retries a 429 then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(res(200, { results: { bindings: [] } }));
    await clientWith(CFG).select("q");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws WikidataError once retries are exhausted", async () => {
    fetchMock.mockResolvedValue(res(500, {}));
    await expect(clientWith({ ...CFG, WIKIDATA_MAX_RETRIES: "0" }).select("q")).rejects.toBeInstanceOf(WikidataError);
  });
});
