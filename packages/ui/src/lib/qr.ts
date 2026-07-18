/**
 * QR helpers — thin wrappers over the `qrcode` renderer. `qrSvg` is crisp/scalable (pure JS,
 * no canvas) for download; `qrPngDataUrl` is a rasterised data-URL for on-screen preview,
 * download and copy-to-clipboard. `qrFilename` derives a tidy download name from the URL.
 */
import QRCode from "qrcode";

/** Scalable SVG markup for `value`. Quiet-zone margin kept minimal so it embeds tightly. */
export function qrSvg(value: string, width = 256): Promise<string> {
  return QRCode.toString(value, { type: "svg", margin: 1, width });
}

/** A `data:image/png;base64,…` URL for `value`, for <img>/download/clipboard. */
export function qrPngDataUrl(value: string, width = 512): Promise<string> {
  return QRCode.toDataURL(value, { margin: 1, width });
}

/** A tidy download filename from a URL — its host + first path segment, else "qr-code". */
export function qrFilename(value: string, ext: "png" | "svg"): string {
  let base = value;
  try {
    const u = new URL(value);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    base = seg ? `${u.hostname}-${seg}` : u.hostname;
  } catch {
    /* not a URL — slug the raw string */
  }
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${slug || "qr-code"}.${ext}`;
}
