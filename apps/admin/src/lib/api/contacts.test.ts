import { describe, expect, it, vi, beforeEach } from "vitest";

// contacts.ts re-exports the shared client from @uprise/field, which calls
// request() from @uprise/api-client — so that's the transport we mock here.
vi.mock("@uprise/api-client", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@uprise/api-client";
import { getContactProfile, searchContacts, updateContact } from "./contacts";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("contacts api client (re-exported from @uprise/field)", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("getContactProfile GETs the encoded contact endpoint", async () => {
    await getContactProfile("ct/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/contacts/ct%2F1");
    expect(opts).toBeUndefined();
  });

  it("searchContacts encodes the query into the querystring", async () => {
    await searchContacts("jane doe");
    expect(mockReq.mock.calls[0][0]).toBe("/contacts?query=jane+doe");
  });

  it("updateContact PATCHes the encoded contact with the JSON body", async () => {
    const input = { firstName: "Jane", tags: ["vip"] };
    await updateContact("ct/1", input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/contacts/ct%2F1");
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual(input);
  });
});
