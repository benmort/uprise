import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBlast,
  importAudienceCsv,
  login,
  sendBlast,
} from "./api";

vi.mock("./auth", () => ({
  getCredentials: () => ({ username: "admin", password: "secret" }),
  getBasicAuthHeader: () => "Basic YWRtaW46c2VjcmV0",
}));

describe("api smoke flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("authenticates via /auth/check for login flow", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const result = await login("admin", "secret");
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/auth/check",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Basic YWRtaW46c2VjcmV0",
        }),
      }),
    );
  });

  it("creates and sends a blast through API endpoints", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "blast_1", status: "DRAFTED" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { blast: { status: "SENDING" }, sent: 1 } }),
      } as Response);

    const created = await createBlast({
      title: "Campaign",
      audienceId: "aud_1",
      bodyTemplate: "Hello",
    });
    expect(created.ok).toBe(true);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/v1/blasts",
      expect.objectContaining({
        method: "POST",
      }),
    );

    const sent = await sendBlast("blast_1");
    expect(sent.ok).toBe(true);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/v1/blasts/blast_1/send",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("imports audience CSV with multipart upload", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { importedRows: 2 } }),
    } as Response);
    const file = new File(["phone\n+15551234567"], "contacts.csv", {
      type: "text/csv",
    });
    const imported = await importAudienceCsv("aud_1", file);
    expect(imported.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/audiences/aud_1/import-csv",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Basic YWRtaW46c2VjcmV0",
        }),
      }),
    );
  });
});
