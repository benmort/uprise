// The submit half of the offline outbox: turns one OutboxRecord into a network call and a
// SubmitResult. Split out from use-sync-queue so it's testable in the coverage-gated lib layer
// (every network fn is injected). Knows the three record types and how a knock resolves its
// photo/contact references (enqueued earlier, so FIFO guarantees they flush first).

import type { OutboxRecord, SubmitResult } from "./sync-queue";

/** Minimal result shape shared by the injected API calls (matches @uprise/api-client's ApiResult
 *  and the photo-upload helper). */
export type ApiOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DispatchDeps {
  uploadPhoto: (blob: Blob, filename: string, mimeType: string) => Promise<ApiOutcome<{ url: string }>>;
  createContact: (input: Record<string, unknown>) => Promise<ApiOutcome<{ id: string }>>;
  submitKnock: (input: Record<string, unknown>) => Promise<ApiOutcome<unknown>>;
  getBlob: (key: string) => Promise<Blob | undefined>;
  deleteBlob: (key: string) => Promise<void>;
  lookup: (localId: string) => Promise<OutboxRecord | undefined>;
}

/** Transient (retry) vs terminal (CONFLICT). Network/timeout/5xx/auth are transient; a domain
 *  4xx (TURF_NOT_ASSIGNED, CONTACT_NOT_FOUND, storage-not-configured) is terminal. */
export function classify(error: string): SubmitResult {
  const transient = /network|fetch|timeout|Failed to fetch|Not authenticated|50\d/i.test(error);
  return { ok: false, retriable: transient, error };
}

export function makeOutboxSubmit(deps: DispatchDeps): (record: OutboxRecord) => Promise<SubmitResult> {
  return async (record) => {
    if (record.type === "DOOR_PHOTO") {
      const { blobKey, filename, mimeType } = record.payload as {
        blobKey: string;
        filename: string;
        mimeType: string;
      };
      const blob = await deps.getBlob(blobKey);
      // The blob was evicted (or never stored) — the photo is unrecoverable. Terminal, but the
      // knock that referenced it still records (the photo is optional metadata).
      if (!blob) return { ok: false, retriable: false, error: "PHOTO_DATA_LOST" };
      const res = await deps.uploadPhoto(blob, filename, mimeType);
      if (res.ok) {
        await deps.deleteBlob(blobKey); // free the quota once the bytes are on the server
        return { ok: true, result: { url: res.data.url } };
      }
      return classify(res.error);
    }

    if (record.type === "ADD_CONTACT") {
      const res = await deps.createContact(record.payload);
      if (res.ok) return { ok: true, result: { id: res.data.id } };
      return classify(res.error);
    }

    // DOOR_KNOCK — resolve any photo/contact references to real server values first.
    const payload: Record<string, unknown> = { ...record.payload };

    const photoRef = payload.photoRef as string | undefined;
    if (photoRef) {
      const ref = await deps.lookup(photoRef);
      if (ref?.status === "DONE") {
        payload.photoUrl = (ref.result as { url?: string } | undefined)?.url;
      } else if (ref && (ref.status === "PENDING" || ref.status === "SYNCING")) {
        // The photo hasn't uploaded yet — wait for it (retriable break; self-heals next flush).
        return { ok: false, retriable: true, error: "PHOTO_PENDING" };
      }
      // CONFLICT or missing: the photo is optional — drop it and record the knock anyway.
      delete payload.photoRef;
    }

    const contactRef = payload.contactRef as string | undefined;
    if (contactRef) {
      const ref = await deps.lookup(contactRef);
      if (ref?.status === "DONE") {
        payload.contactId = (ref.result as { id?: string } | undefined)?.id;
      } else if (ref && (ref.status === "PENDING" || ref.status === "SYNCING")) {
        return { ok: false, retriable: true, error: "CONTACT_PENDING" };
      } else {
        // The resident this knock is about failed to create — the knock can't exist. Terminal.
        return { ok: false, retriable: false, error: "CONTACT_UNRESOLVED" };
      }
      delete payload.contactRef;
    }

    if (!payload.contactId) return { ok: false, retriable: false, error: "NO_CONTACT" };

    const res = await deps.submitKnock(payload);
    if (res.ok) return { ok: true };
    return classify(res.error);
  };
}
