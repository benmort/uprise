// The submit half of the offline outbox: turns one OutboxRecord into a network call and a
// SubmitResult. Split out from use-sync-queue so it's testable in the coverage-gated lib layer
// (every network fn is injected). Knows the three record types and how a knock resolves its
// photo/contact references (enqueued earlier, so FIFO guarantees they flush first).

import type { OutboxRecord, SubmitResult } from "./sync-queue";

/**
 * Minimal result shape shared by the injected API calls (matches @uprise/api-client's ApiResult
 * and the photo-upload helper).
 *
 * The failure FLAGS are carried through deliberately. They exist on `ApiResult` already, and
 * narrowing them away left `classify` to re-derive retriability by pattern-matching the human
 * error string — which silently lost a canvasser's work (see `classify`).
 */
export type ApiOutcome<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      /** HTTP status, when the API actually answered. */
      status?: number;
      /** The request definitively never left the device. */
      networkError?: boolean;
      /** We gave up waiting — it may still have landed. */
      timedOut?: boolean;
    };

export interface DispatchDeps {
  uploadPhoto: (blob: Blob, filename: string, mimeType: string) => Promise<ApiOutcome<{ url: string }>>;
  createContact: (input: Record<string, unknown>) => Promise<ApiOutcome<{ id: string }>>;
  submitKnock: (input: Record<string, unknown>) => Promise<ApiOutcome<unknown>>;
  getBlob: (key: string) => Promise<Blob | undefined>;
  deleteBlob: (key: string) => Promise<void>;
  lookup: (localId: string) => Promise<OutboxRecord | undefined>;
}

/**
 * Transient (retry) vs terminal (CONFLICT).
 *
 * Decided from the STRUCTURED failure, never from the wording. This used to regex the message for
 * /network|fetch|timeout|…|50\d/, and the strings the stack actually produces do not match it:
 *
 *   "The request timed out after 30 seconds."   (api-client's own abort)  → missed
 *   "Load failed"                               (WebKit's transport error) → missed
 *   "Upload failed (401)"                       (the photo helper)         → missed
 *   "Internal server error"                     (a 500 with a prose body)  → missed
 *
 * Chrome says "Failed to fetch" and matched; Safari says "Load failed" and did not. So a canvasser
 * on an iOS PWA in marginal signal had every pending knock parked as a terminal CONFLICT —
 * unrecoverable work, on the platform most likely to hit it.
 *
 * Rules, in order: a transport failure or a timeout is always retriable; an HTTP status decides
 * itself (5xx and 401/408/429 retriable, other 4xx terminal); anything left with no structure at
 * all is retriable, because losing a door knock is worse than trying it twice — the API's
 * `localId` dedup is what makes that safe.
 */
export function classify(failure: {
  error: string;
  status?: number;
  networkError?: boolean;
  timedOut?: boolean;
}): SubmitResult {
  const { error, status, networkError, timedOut } = failure;
  if (networkError || timedOut) return { ok: false, retriable: true, error };
  if (typeof status === "number") {
    const retriable = status >= 500 || status === 401 || status === 408 || status === 429;
    return { ok: false, retriable, error };
  }
  // A domain refusal (TURF_NOT_ASSIGNED, CONTACT_NOT_FOUND, storage-not-configured) arrives as a
  // 4xx and is caught above. With no status and no flags we cannot tell, so keep the work.
  return { ok: false, retriable: true, error };
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
      return classify(res);
    }

    if (record.type === "ADD_CONTACT") {
      const res = await deps.createContact(record.payload);
      if (res.ok) return { ok: true, result: { id: res.data.id } };
      return classify(res);
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
    return classify(res);
  };
}
