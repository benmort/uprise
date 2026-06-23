import { request } from "./request-core";

export async function getLatestByContact() {
  return request<Record<string, { direction: string; date: string; body: string; status: string }>>(
    "/messages/latest-by-contact",
  );
}

export async function getConversationMessages(phoneNumber: string) {
  const q = new URLSearchParams({ phoneNumber, pageSize: "100" });
  return request<{ messages: Array<Record<string, unknown>>; nextPageToken: string | null; previousPageToken: string | null }>(`/messages?${q}`);
}

export async function sendMessage(to: string, body: string) {
  return request("/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, body }),
  });
}
