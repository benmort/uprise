import { request } from "@/lib/api";

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Returned only at creation — `key` is the plaintext, shown once and never again. */
export type IssuedApiKey = ApiKeySummary & { key: string };

export async function listApiKeys() {
  return request<ApiKeySummary[]>("/api-keys");
}

export async function issueApiKey(name: string) {
  return request<IssuedApiKey>("/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function revokeApiKey(id: string) {
  return request<ApiKeySummary>(`/api-keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
