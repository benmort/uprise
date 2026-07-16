import { request } from "@/lib/api";

// Content reuse: bind one survey/script/disposition-set/canned-set to many objects
// (canvass campaigns + text blasts). Mirrors the API's canvass content types.
export type ContentType = "SURVEY" | "SCRIPT" | "DISPOSITION_SET" | "CANNED_SET";
export type ContentObjectType = "CANVASS_CAMPAIGN" | "BLAST";
export type ContentSlot = "PRIMARY" | "OPENING" | "PERSUASION" | "FOLLOW_UP";

export type ContentBinding = {
  id: string;
  tenantId: string;
  contentType: ContentType;
  contentId: string;
  objectType: ContentObjectType;
  objectId: string;
  slot: ContentSlot;
  orderIndex: number;
  createdAt: string;
  contentName?: string | null;
};

export type ContentUsage = {
  count: number;
  objects: Array<{
    bindingId: string;
    objectType: ContentObjectType;
    objectId: string;
    slot: ContentSlot;
    objectName: string | null;
  }>;
};

export type SetSummary = {
  id: string;
  name: string;
  isArchived: boolean;
  updatedAt: string;
  _count?: { items: number };
};

export async function listBindings(objectType: ContentObjectType, objectId: string) {
  return request<ContentBinding[]>(
    `/engagement/bindings?objectType=${objectType}&objectId=${encodeURIComponent(objectId)}`,
  );
}

export async function createBinding(input: {
  contentType: ContentType;
  contentId: string;
  objectType: ContentObjectType;
  objectId: string;
  slot?: ContentSlot;
  orderIndex?: number;
}) {
  return request<ContentBinding>("/engagement/bindings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteBinding(id: string) {
  return request<{ deleted: boolean }>(`/engagement/bindings/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function contentUsage(type: ContentType, id: string) {
  return request<ContentUsage>(
    `/engagement/content/${type}/${encodeURIComponent(id)}/usage`,
  );
}

export async function getContentFlow(objectType: ContentObjectType, objectId: string) {
  return request<{
    objectType: ContentObjectType;
    objectId: string;
    survey: unknown | null;
    script: unknown | null;
    dispositions: unknown[];
    canned: unknown[];
  }>(`/engagement/flow?objectType=${objectType}&objectId=${encodeURIComponent(objectId)}`);
}

export type EngagementChannel = "DOOR" | "SMS" | "BOTH";

/** Record a disposition against a contact (SMS console / texting session). */
export async function recordDisposition(input: {
  contactId: string;
  code: string;
  channel: EngagementChannel;
  blastId?: string | null;
  campaignId?: string | null;
}) {
  return request<{ id: string }>("/engagement/dispositions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Record one survey answer against a contact. */
export async function recordSurveyAnswer(input: {
  contactId: string;
  questionId: string;
  optionId?: string | null;
  valueText?: string | null;
  channel: EngagementChannel;
  blastId?: string | null;
  campaignId?: string | null;
}) {
  return request<{ id: string }>("/engagement/survey-answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listDispositionSets() {
  return request<SetSummary[]>("/engagement/disposition-sets");
}

export async function listCannedSets() {
  return request<SetSummary[]>("/engagement/canned-sets");
}

/**
 * Reconcile a single content slot on an object: create the binding when a content id
 * is chosen, delete the current one when cleared, and no-op when unchanged. Returns
 * the first error encountered (if any) so callers can surface it.
 */
export async function setPrimaryBinding(
  objectType: ContentObjectType,
  objectId: string,
  contentType: ContentType,
  nextContentId: string | null,
  current: ContentBinding[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = current.find((b) => b.contentType === contentType && b.slot === "PRIMARY");
  if ((existing?.contentId ?? null) === (nextContentId || null)) return { ok: true };
  if (nextContentId) {
    const res = await createBinding({ contentType, contentId: nextContentId, objectType, objectId });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  if (existing) {
    const res = await deleteBinding(existing.id);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  return { ok: true };
}
