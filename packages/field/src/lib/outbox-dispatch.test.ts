import { describe, expect, it, vi } from "vitest";
import { classify, makeOutboxSubmit, type ApiOutcome, type DispatchDeps } from "./outbox-dispatch";
import type { OutboxRecord } from "./sync-queue";

const rec = (over: Partial<OutboxRecord>): OutboxRecord => ({
  localId: "x",
  type: "DOOR_KNOCK",
  payload: {},
  status: "PENDING",
  attempts: 0,
  clientCapturedAt: "2026-06-16T10:00:00Z",
  ...over,
});

function deps(over: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    uploadPhoto: vi.fn(async (): Promise<ApiOutcome<{ url: string }>> => ({ ok: true, data: { url: "https://cdn/p.jpg" } })),
    createContact: vi.fn(async (): Promise<ApiOutcome<{ id: string }>> => ({ ok: true, data: { id: "srv_c1" } })),
    submitKnock: vi.fn(async (): Promise<ApiOutcome<unknown>> => ({ ok: true, data: {} })),
    getBlob: vi.fn(async () => new Blob(["img"])),
    deleteBlob: vi.fn(async () => {}),
    lookup: vi.fn(async () => undefined),
    ...over,
  };
}

describe("classify", () => {
  it("retries a transport failure or a timeout, whatever the wording", () => {
    expect(classify({ error: "Failed to fetch", networkError: true })).toMatchObject({ retriable: true });
    // WebKit's wording. The old regex only knew Chrome's, so iOS canvassers lost their work.
    expect(classify({ error: "Load failed", networkError: true })).toMatchObject({ retriable: true });
    expect(classify({ error: "The request timed out after 30 seconds.", timedOut: true })).toMatchObject({
      retriable: true,
    });
    expect(classify({ error: "The request timed out after 120 seconds.", timedOut: true })).toMatchObject({
      retriable: true,
    });
  });

  it("decides from the HTTP status, not the prose", () => {
    // A 500 whose body says "Internal server error" — no digits the old regex could find.
    expect(classify({ error: "Internal server error", status: 500 })).toMatchObject({ retriable: true });
    expect(classify({ error: "Upload failed (401)", status: 401 })).toMatchObject({ retriable: true });
    expect(classify({ error: "Too many requests", status: 429 })).toMatchObject({ retriable: true });
    expect(classify({ error: "Request timeout", status: 408 })).toMatchObject({ retriable: true });
  });

  it("treats a domain refusal as terminal", () => {
    expect(classify({ error: "TURF_NOT_ASSIGNED", status: 409 })).toMatchObject({ retriable: false });
    expect(classify({ error: "CONTACT_NOT_FOUND", status: 404 })).toMatchObject({ retriable: false });
    expect(classify({ error: "Storage is not configured", status: 400 })).toMatchObject({ retriable: false });
    expect(classify({ error: "Forbidden", status: 403 })).toMatchObject({ retriable: false });
  });

  // Losing a door knock is worse than sending it twice — the API dedups on localId.
  it("keeps the work when there is no structure to judge by", () => {
    expect(classify({ error: "something odd" })).toMatchObject({ retriable: true });
  });

  it("passes the message through unchanged", () => {
    expect(classify({ error: "Load failed", networkError: true }).error).toBe("Load failed");
  });
});

describe("makeOutboxSubmit — DOOR_PHOTO", () => {
  it("uploads the blob, returns the url, and frees the blob", async () => {
    const d = deps();
    const res = await makeOutboxSubmit(d)(rec({ type: "DOOR_PHOTO", payload: { blobKey: "x", filename: "p.jpg", mimeType: "image/jpeg" } }));
    expect(res).toEqual({ ok: true, result: { url: "https://cdn/p.jpg" } });
    expect(d.deleteBlob).toHaveBeenCalledWith("x");
  });

  it("is terminal when the blob was evicted", async () => {
    const d = deps({ getBlob: vi.fn(async () => undefined) });
    const res = await makeOutboxSubmit(d)(rec({ type: "DOOR_PHOTO", payload: { blobKey: "x" } }));
    expect(res).toMatchObject({ ok: false, retriable: false, error: "PHOTO_DATA_LOST" });
  });

  it("classifies an upload failure (network → retriable)", async () => {
    const d = deps({ uploadPhoto: vi.fn(async () => ({ ok: false, error: "network down" })) });
    const res = await makeOutboxSubmit(d)(rec({ type: "DOOR_PHOTO", payload: { blobKey: "x" } }));
    expect(res).toMatchObject({ ok: false, retriable: true });
  });
});

describe("makeOutboxSubmit — ADD_CONTACT", () => {
  it("creates the contact and returns its id", async () => {
    const res = await makeOutboxSubmit(deps())(rec({ type: "ADD_CONTACT", payload: { firstName: "Ada" } }));
    expect(res).toEqual({ ok: true, result: { id: "srv_c1" } });
  });
});

describe("makeOutboxSubmit — DOOR_KNOCK ref resolution", () => {
  it("resolves a DONE photoRef into photoUrl and posts", async () => {
    const submitKnock = vi.fn(async () => ({ ok: true as const, data: {} }));
    const d = deps({
      submitKnock,
      lookup: vi.fn(async (id) => (id === "ph1" ? rec({ localId: "ph1", type: "DOOR_PHOTO", status: "DONE", result: { url: "u" } }) : undefined)),
    });
    const res = await makeOutboxSubmit(d)(rec({ payload: { contactId: "c1", photoRef: "ph1" } }));
    expect(res).toEqual({ ok: true });
    const posted = submitKnock.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.photoUrl).toBe("u");
    expect(posted).not.toHaveProperty("photoRef");
  });

  it("waits (retriable) while a photoRef is still pending", async () => {
    const d = deps({ lookup: vi.fn(async () => rec({ status: "PENDING", type: "DOOR_PHOTO" })) });
    const res = await makeOutboxSubmit(d)(rec({ payload: { contactId: "c1", photoRef: "ph1" } }));
    expect(res).toMatchObject({ ok: false, retriable: true, error: "PHOTO_PENDING" });
  });

  it("drops a conflicted/missing photoRef and records the knock anyway", async () => {
    const submitKnock = vi.fn(async () => ({ ok: true as const, data: {} }));
    const d = deps({ submitKnock, lookup: vi.fn(async () => rec({ status: "CONFLICT", type: "DOOR_PHOTO" })) });
    const res = await makeOutboxSubmit(d)(rec({ payload: { contactId: "c1", photoRef: "ph1" } }));
    expect(res).toEqual({ ok: true });
    expect((submitKnock.mock.calls[0][0] as Record<string, unknown>).photoUrl).toBeUndefined();
  });

  it("resolves a DONE contactRef into contactId", async () => {
    const submitKnock = vi.fn(async () => ({ ok: true as const, data: {} }));
    const d = deps({
      submitKnock,
      lookup: vi.fn(async () => rec({ type: "ADD_CONTACT", status: "DONE", result: { id: "srv_c9" } })),
    });
    const res = await makeOutboxSubmit(d)(rec({ payload: { contactRef: "c_local" } }));
    expect(res).toEqual({ ok: true });
    expect((submitKnock.mock.calls[0][0] as Record<string, unknown>).contactId).toBe("srv_c9");
  });

  it("is terminal when a contactRef failed to create (knock can't exist)", async () => {
    const d = deps({ lookup: vi.fn(async () => rec({ type: "ADD_CONTACT", status: "CONFLICT" })) });
    const res = await makeOutboxSubmit(d)(rec({ payload: { contactRef: "c_local" } }));
    expect(res).toMatchObject({ ok: false, retriable: false, error: "CONTACT_UNRESOLVED" });
  });

  it("is terminal when there is no contact at all", async () => {
    const res = await makeOutboxSubmit(deps())(rec({ payload: {} }));
    expect(res).toMatchObject({ ok: false, retriable: false, error: "NO_CONTACT" });
  });
});
