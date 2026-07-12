import { Injectable } from "@nestjs/common";
import { put } from "@vercel/blob";
import { namespacedBlobKey } from "../utils/blob";

export type PutOptions = {
  /** Blob key BEFORE environment namespacing — namespacing is applied here, always. */
  key: string;
  contentType?: string;
  /** Overwrite an existing key in place. For stable, re-syncable keys (e.g. a politician photo). */
  allowOverwrite?: boolean;
};

/**
 * The one place every image/file upload goes through: the credential guard, the environment
 * namespacing (`namespacedBlobKey`), and the `put(..., access:"public")` call — previously
 * copy-pasted into five services, one of which (telephony) skipped namespacing and leaked dev
 * blobs to the store root. Storage rows/shapes stay with the callers; this owns bytes → Blob only.
 */
@Injectable()
export class ImageUploadService {
  /** True when a Blob write is possible: a static token, or the Vercel OIDC store id. */
  get enabled(): boolean {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
  }

  /** Lowercase alphanumeric extension from a filename, or the fallback when there is none. */
  extFrom(name: string | null | undefined, fallback = "jpg"): string {
    const dot = name ? name.lastIndexOf(".") : -1;
    if (dot < 0) return fallback;
    const ext = name!.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
    return ext || fallback;
  }

  /** A random, collision-free key under a prefix (for user uploads that never overwrite). */
  randomKey(prefix: string, ext: string): string {
    return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  }

  /** Upload bytes to the public Blob store under a namespaced key. Throws if storage is unconfigured. */
  async put(buffer: Buffer, opts: PutOptions): Promise<{ url: string; key: string }> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token && !process.env.BLOB_STORE_ID) {
      throw new Error("Image storage is not configured (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID)");
    }
    const key = namespacedBlobKey(opts.key);
    const { url } = await put(key, buffer, {
      access: "public",
      contentType: opts.contentType || "application/octet-stream",
      ...(opts.allowOverwrite ? { allowOverwrite: true } : {}),
      ...(token ? { token } : {}),
    });
    return { url, key };
  }

  /**
   * Fetch a remote image and re-host it. Returns null — never throws — on any failure (unconfigured,
   * unreachable, non-200), so one bad source can't fail a batch (the civic Wikimedia mirror relies
   * on this). `userAgent` is required by some hosts (Wikimedia).
   */
  async mirror(
    remoteUrl: string,
    opts: { key: string; userAgent?: string; allowOverwrite?: boolean },
  ): Promise<{ url: string; key: string; contentType: string } | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(remoteUrl, opts.userAgent ? { headers: { "User-Agent": opts.userAgent } } : undefined);
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await res.arrayBuffer());
      const out = await this.put(buffer, { key: opts.key, contentType, allowOverwrite: opts.allowOverwrite });
      return { ...out, contentType };
    } catch {
      return null;
    }
  }
}
