import { getBasicAuthHeader, getCredentials } from "./auth";
import { getApiUrl } from "./api";

export async function request<T = any>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const credentials = getCredentials();
  if (!credentials) return { ok: false, error: "Not authenticated" };
  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: getBasicAuthHeader(credentials),
        ...(init?.headers || {}),
      },
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || json?.message || `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: (json?.data ?? json) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
