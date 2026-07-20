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
  it("marks network/timeout/5xx/auth transient, domain errors terminal", () => {
    expect(classify("Failed to fetch")).toMatchObject({ retriable: true });
    expect(classify("503 upstream")).toMatchObject({ retriable: true });
    expect(classify("Not authenticated")).toMatchObject({ retriable: true });
    expect(classify("TURF_NOT_ASSIGNED")).toMatchObject({ retriable: false });
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
