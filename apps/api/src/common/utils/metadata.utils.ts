export type MetadataRecord = Record<string, string | number | boolean | null>;

export function sanitizeMetadata(
  value: unknown,
  maxFields = 50,
  maxValueLength = 500,
): MetadataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, maxFields);
  const out: MetadataRecord = {};
  for (const [k, v] of entries) {
    const key = String(k).trim();
    if (!key) continue;
    if (typeof v === "string") {
      out[key] = v.slice(0, maxValueLength);
      continue;
    }
    if (typeof v === "number" || typeof v === "boolean" || v === null) {
      out[key] = v;
      continue;
    }
    out[key] = String(v).slice(0, maxValueLength);
  }
  return out;
}
