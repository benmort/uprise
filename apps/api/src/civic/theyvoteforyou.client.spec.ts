import { TheyVoteForYouAuthError, TheyVoteForYouClient, TheyVoteForYouError } from "./theyvoteforyou.client";

type Cfg = Record<string, string | undefined>;
const clientWith = (cfg: Cfg) => new TheyVoteForYouClient({ get: (k: string) => cfg[k] } as never);

const res = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: new Headers(headers),
  json: async () => body,
});

const BASE_CFG: Cfg = {
  THEYVOTEFORYOU_API_KEY: "test-key",
  THEYVOTEFORYOU_API_BASE_URL: "https://tvfy.test/api/v1",
  THEYVOTEFORYOU_SYNC_REQUESTS_PER_SECOND: "50",
  THEYVOTEFORYOU_SYNC_MAX_RETRIES: "2",
};

describe("TheyVoteForYouClient", () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it("listPeople hits people.json with the key appended and returns the array", async () => {
    fetchMock.mockResolvedValueOnce(res(200, [{ id: 1 }, { id: 2 }]));
    const people = await clientWith(BASE_CFG).listPeople();
    expect(people).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://tvfy.test/api/v1/people.json?key=test-key");
  });

  it("getPerson returns detail; a 404 → null", async () => {
    fetchMock.mockResolvedValueOnce(res(200, { id: 10001, rebellions: 3 }));
    expect(await clientWith(BASE_CFG).getPerson(10001)).toMatchObject({ id: 10001, rebellions: 3 });
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await clientWith(BASE_CFG).getPerson(999)).toBeNull();
  });

  it("listPolicies + getPolicy build the right paths", async () => {
    fetchMock.mockResolvedValueOnce(res(200, [{ id: 1, name: "P" }]));
    await clientWith(BASE_CFG).listPolicies();
    expect(fetchMock.mock.calls[0][0]).toBe("https://tvfy.test/api/v1/policies.json?key=test-key");
    fetchMock.mockResolvedValueOnce(res(200, { id: 1, name: "P" }));
    await clientWith(BASE_CFG).getPolicy(1);
    expect(fetchMock.mock.calls[1][0]).toBe("https://tvfy.test/api/v1/policies/1.json?key=test-key");
  });

  it("throws TheyVoteForYouAuthError on 401/403", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    await expect(clientWith(BASE_CFG).listPolicies()).rejects.toBeInstanceOf(TheyVoteForYouAuthError);
  });

  it("throws when the API key is missing", async () => {
    await expect(
      clientWith({ ...BASE_CFG, THEYVOTEFORYOU_API_KEY: undefined }).listPeople(),
    ).rejects.toBeInstanceOf(TheyVoteForYouError);
  });

  it("retries a 500 then succeeds", async () => {
    fetchMock.mockResolvedValueOnce(res(500, {})).mockResolvedValueOnce(res(200, [{ id: 1 }]));
    const policies = await clientWith(BASE_CFG).listPolicies();
    expect(policies).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up with TheyVoteForYouError once retries are exhausted", async () => {
    fetchMock.mockResolvedValue(res(500, {}));
    await expect(
      clientWith({ ...BASE_CFG, THEYVOTEFORYOU_SYNC_MAX_RETRIES: "0" }).getPolicy(1),
    ).rejects.toBeInstanceOf(TheyVoteForYouError);
  });
});
