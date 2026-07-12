import { Injectable, Logger } from "@nestjs/common";
import { ImageUploadService } from "../common/storage/image-upload.service";

/**
 * Re-hosts a Wikimedia Commons photo into our own Blob store.
 *
 * Wikidata P18 gives a Commons file; we do NOT hotlink it (that hammers Wikimedia and leaves us
 * at the mercy of a rename). We fetch a fixed-width thumbnail once and store it, then keep the
 * attribution the licence requires travelling with the copy: the file page, the author and the
 * licence short name. Everything here is best-effort — a member with no free photo, or a fetch
 * that fails, leaves `imageUrl` null and the UI falls back to initials.
 */

/** A descriptive User-Agent is required by the Wikimedia API policy. */
const USER_AGENT = "uprise-civic/1.0 (https://uprise.org.au; civic reference data; contact@upriselabs.org)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Avatar-scale; a headshot never needs full resolution, and this bounds storage + bandwidth. */
const THUMB_WIDTH = 400;

export interface MirroredImage {
  imageUrl: string;
  imageSourceUrl: string;
  imageCredit: string | null;
  imageLicence: string | null;
  imageSourceRef: string;
}

/** The bare Commons filename from a P18 value (a `Special:FilePath/<file>` URL) or a raw name. */
export function commonsFilename(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const afterPath = /Special:FilePath\/(.+)$/i.exec(trimmed);
  const afterFile = /\/(?:File|Image):(.+)$/i.exec(trimmed);
  const raw = afterPath?.[1] ?? afterFile?.[1] ?? (trimmed.includes("/") ? null : trimmed);
  if (!raw) return null;
  // Commons stores spaces as underscores and the P18 value is URL-encoded; normalise to display form.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep raw when it isn't valid percent-encoding */
  }
  return decoded.replace(/_/g, " ").replace(/\?.*$/, "").trim() || null;
}

/** The human-facing Commons file page, for the attribution link. */
export function commonsFilePageUrl(filename: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename.replace(/ /g, "_"))}`;
}

/** The fixed-width thumbnail URL — Special:FilePath renders + caches the thumb server-side. */
export function commonsThumbUrl(filename: string, width = THUMB_WIDTH): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename.replace(/ /g, "_"))}?width=${width}`;
}

/** Lowercase file extension (jpg/png/…), defaulting to jpg when there is none. */
export function imageExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "jpg";
  const ext = filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "jpg";
}

/** Commons `Artist`/credit fields are HTML; reduce to plain text for storage. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

@Injectable()
export class CommonsImageService {
  private readonly logger = new Logger(CommonsImageService.name);

  constructor(private readonly images: ImageUploadService) {}

  /** True when a Blob write is possible; otherwise mirroring is skipped, not attempted. */
  get enabled(): boolean {
    return this.images.enabled;
  }

  /**
   * Fetch, re-host and attribute a Commons photo. `ref` is a P18 value; `destBase` keys the blob
   * (the politician id). Returns null — never throws — when disabled, unresolvable or unreachable,
   * so one bad photo never fails a sync of hundreds. The fetch + re-host goes through the shared
   * {@link ImageUploadService.mirror}; only the Commons-specific licence lookup lives here.
   */
  async mirror(ref: string, destBase: string): Promise<MirroredImage | null> {
    if (!this.enabled) return null;
    const filename = commonsFilename(ref);
    if (!filename) return null;

    const meta = await this.licence(filename); // best-effort; null on failure
    const mirrored = await this.images.mirror(commonsThumbUrl(filename), {
      key: `civic/politicians/${destBase}.${imageExtension(filename)}`,
      userAgent: USER_AGENT,
      allowOverwrite: true, // a re-sync of the same politician overwrites their headshot in place
    });
    if (!mirrored) {
      this.logger.warn(`Could not mirror the Commons photo for ${filename}`);
      return null;
    }
    return {
      imageUrl: mirrored.url,
      imageSourceUrl: commonsFilePageUrl(filename),
      imageCredit: meta?.credit ?? null,
      imageLicence: meta?.licence ?? null,
      imageSourceRef: filename,
    };
  }

  /** Author + licence from the Commons imageinfo extmetadata. Best-effort; null on any failure. */
  private async licence(filename: string): Promise<{ credit: string | null; licence: string | null } | null> {
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      iiprop: "extmetadata",
      titles: `File:${filename}`,
      format: "json",
      formatversion: "2",
    });
    try {
      const res = await fetch(`${COMMONS_API}?${params.toString()}`, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        query?: { pages?: Array<{ imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> }> };
      };
      const ext = body.query?.pages?.[0]?.imageinfo?.[0]?.extmetadata;
      if (!ext) return null;
      const artist = ext.Artist?.value ? stripHtml(ext.Artist.value) : null;
      const licence = ext.LicenseShortName?.value ? stripHtml(ext.LicenseShortName.value) : null;
      return { credit: artist || null, licence: licence || null };
    } catch {
      return null;
    }
  }
}
