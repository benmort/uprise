/**
 * Normalise a raw address into a stable dedup key. This is a dedup key, NOT a
 * geocoding source of truth: lowercase, collapse internal whitespace, strip
 * punctuation. Returns null for empty/blank input so address-less contacts skip
 * the (org, addressNorm) partial unique index.
 */
export function normalizeAddress(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/[.,#/\\'"`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}
