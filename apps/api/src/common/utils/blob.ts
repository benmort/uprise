/**
 * Vercel Blob key namespacing.
 *
 * Every upload site (profile avatars, tenant files, door-knock photos) writes to ONE
 * blob store. Off-production we point dev/staging at that same (production) store but
 * prefix keys with a `development/` namespace, so local uploads never collide with —
 * or overwrite — real tenant assets sitting at the store root. In production the
 * namespace is empty, so existing keys and their public URLs are unchanged.
 *
 * Override the namespace explicitly with BLOB_NAMESPACE (e.g. a per-preview prefix).
 */

/** The key-prefix namespace for this environment: "" in production, "development"
 *  otherwise. Override with BLOB_NAMESPACE. No leading/trailing slashes. */
export function blobNamespace(): string {
  const explicit = process.env.BLOB_NAMESPACE?.trim().replace(/^\/+|\/+$/g, "");
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? "" : "development";
}

/** Prefix a blob key with the environment namespace (see {@link blobNamespace}). */
export function namespacedBlobKey(key: string): string {
  const ns = blobNamespace();
  const clean = key.replace(/^\/+/, "");
  return ns ? `${ns}/${clean}` : clean;
}
