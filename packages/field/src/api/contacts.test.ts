import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@uprise/api-client", () => ({
  request: vi.fn(async () => ({ ok: true, data: null })),
  getApiUrl: () => "http://api.test",
}));

import { request } from "@uprise/api-client";
import { getContactProfile, searchContacts, updateContact, type UpdateContactInput } from "./contacts";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockReq.mockClear();
  mockReq.mockResolvedValue({ ok: true, data: null });
});

describe("contacts api client", () => {
  it("getContactProfile GETs the encoded contact endpoint", async () => {
    await getContactProfile("c/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/contacts/c%2F1");
    expect(opts).toBeUndefined();
  });

  it("searchContacts encodes the query string", async () => {
    await searchContacts("ada smith");
    expect(mockReq.mock.calls[0][0]).toBe("/contacts?query=ada+smith");
  });

  it("updateContact PATCHes the fields as the JSON body", async () => {
    const input: UpdateContactInput = { firstName: "Ada", tags: ["vip"] };
    await updateContact("c1", input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/contacts/c1");
    expect(opts?.method).toBe("PATCH");
    expect((opts?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts?.body as string)).toEqual(input);
  });
});
