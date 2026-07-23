import { request } from "@uprise/api-client";

// Volunteer P2P texting — typed wrappers over the /texting/* endpoints (the field slice;
// see apps/api/src/texting). All server-side scoping binds to the SESSION user, so no
// volunteerId parameter travels here. Plus the engagement content-flow + recording calls
// the texting session shares with the door flow.

export type TextBankBlast = {
  id: string;
  title: string;
  /** Present for organisers only (oversight); volunteers see counts, not lifecycle. */
  status?: string;
  myAssignedUnsent: number;
  availableToClaim: number;
  createdAt: string;
};

export type TextBank = {
  campaignId: string;
  name: string;
  channel: "SMS" | "BOTH";
  status: string;
  myUnreadConversations: number;
  blasts: TextBankBlast[];
};

export async function listTextBanks(signal?: AbortSignal) {
  return request<TextBank[]>("/texting/banks", signal ? { signal } : undefined);
}

export async function claimTextingBatch(blastId: string, kind: "initial" | "replies", count = 10) {
  return request<{ kind: string; claimed: number }>(`/texting/banks/${encodeURIComponent(blastId)}/claim`, {
    method: "POST",
    body: JSON.stringify({ kind, count }),
  });
}

export type TextingQueue = {
  blastId: string;
  title: string;
  toSend: Array<{ recipientId: string; phone: string; message: string; contactName: string | null }>;
  conversations: Array<{
    contactPhone: string;
    unreadCount: number;
    lastMessageAt: string | null;
    contactName: string | null;
  }>;
};

export async function getTextingQueue(blastId: string, signal?: AbortSignal) {
  return request<TextingQueue>(
    `/texting/banks/${encodeURIComponent(blastId)}/queue`,
    signal ? { signal } : undefined,
  );
}

export async function sendTextingInitial(recipientId: string) {
  return request<{ outcome: "sent" | "skipped_duplicate" | "failed"; recipientId: string; error?: string }>(
    "/texting/send",
    { method: "POST", body: JSON.stringify({ recipientId }) },
  );
}

export type TextingThreadMessage = {
  id: string;
  type: "inbound" | "outbound";
  at: string;
  body: string;
};

export type TextingThread = {
  contactPhone: string;
  contactName?: string | null;
  messages: TextingThreadMessage[];
};

export async function getTextingThread(contactPhone: string, signal?: AbortSignal) {
  return request<TextingThread>(
    `/texting/conversations/${encodeURIComponent(contactPhone)}`,
    signal ? { signal } : undefined,
  );
}

export async function sendTextingReply(contactPhone: string, body: string) {
  return request<{ ok?: boolean }>("/texting/reply", {
    method: "POST",
    body: JSON.stringify({ contactPhone, body }),
  });
}

export async function resolveTextingConversation(contactPhone: string) {
  return request<{ resolved?: boolean }>(
    `/texting/conversations/${encodeURIComponent(contactPhone)}/resolve`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

// ── Session content (shared engagement runtime — same endpoints the door uses) ──────────

export type TextingFlow = {
  dispositions: Array<{ id: string; code: string; label: string; layer: string }>;
  canned: Array<{ id: string; title: string; body: string; dispositionCode?: string | null }>;
  survey: unknown | null;
  script: { name: string; steps: { bodyText: string; outcomeKey?: string | null; orderIndex?: number | null }[] } | null;
};

export async function getTextingFlow(blastId: string, signal?: AbortSignal) {
  return request<TextingFlow>(
    `/engagement/flow?objectType=BLAST&objectId=${encodeURIComponent(blastId)}`,
    signal ? { signal } : undefined,
  );
}

export async function recordTextingDisposition(input: {
  contactId: string;
  code: string;
  blastId?: string | null;
}) {
  return request<{ id: string }>("/engagement/dispositions", {
    method: "POST",
    body: JSON.stringify({ ...input, channel: "SMS" }),
  });
}

export async function recordTextingSurveyAnswer(input: {
  contactId: string;
  questionId: string;
  optionId?: string | null;
  valueText?: string | null;
  blastId?: string | null;
}) {
  return request<{ id: string }>("/engagement/survey-answers", {
    method: "POST",
    body: JSON.stringify({ ...input, channel: "SMS" }),
  });
}
