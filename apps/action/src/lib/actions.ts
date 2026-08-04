import type { PublicActionPagePayload } from "@uprise/contracts";

/**
 * Public action-page data, fetched server-side from the API's unauthenticated
 * `/actions/public/*` surface (no cookie, no CORS — the insights pattern).
 * Returns null on any non-200 so pages render a clean not-found.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return (json && typeof json === "object" && "data" in json ? (json as { data: T }).data : (json as T)) ?? null;
  } catch {
    return null;
  }
}

export const getPublicActionPage = (slug: string, previewToken?: string) =>
  getJson<PublicActionPagePayload>(
    `/actions/public/pages/${encodeURIComponent(slug)}${
      previewToken ? `?previewToken=${encodeURIComponent(previewToken)}` : ""
    }`,
  );
