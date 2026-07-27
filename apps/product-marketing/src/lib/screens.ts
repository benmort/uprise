import MANIFEST from "../../public/images/marketing/screens/screens.json";

/**
 * Lookup over the captured-screenshot manifest written by `pnpm marketing:shots`.
 *
 * Everything about a screenshot travels with the capture — its real pixel dimensions AND its alt
 * text — so a component can't hardcode either and drift. Both failure modes were live on the
 * homepage: the floating "canvasser app" phone was actually the admin dashboard, and it declared
 * 410×554 for a 770×1490 file, so the frame silently cropped it.
 *
 * A missing key returns null rather than throwing. Callers are expected to render nothing (or a
 * pending state) — shipping no image beats shipping a wrong one.
 */
export type Screen = {
  file: string;
  width: number;
  height: number;
  alt: string;
};

type RawEntry = {
  file?: unknown;
  width?: unknown;
  height?: unknown;
  alt?: unknown;
};

const raw = MANIFEST as Record<string, unknown>;

const isUsable = (e: RawEntry): boolean =>
  typeof e.file === "string" &&
  e.file.length > 0 &&
  typeof e.alt === "string" &&
  e.alt.length > 0 &&
  typeof e.width === "number" &&
  e.width > 0 &&
  typeof e.height === "number" &&
  e.height > 0;

/**
 * The manifest entry for `key`, or null when it hasn't been captured yet (or is incomplete — a
 * capture that failed mid-run leaves null dimensions behind).
 */
export function screen(key: string): Screen | null {
  const entry = raw[key];
  if (!entry || typeof entry !== "object") return null;
  const e = entry as RawEntry;
  if (!isUsable(e)) return null;
  return { file: e.file as string, width: e.width as number, height: e.height as number, alt: e.alt as string };
}

/** True when a capture exists for `key` — for gating an optional decorative slot. */
export function hasScreen(key: string): boolean {
  return screen(key) !== null;
}

/** Aspect ratio (w/h) of a capture, or null. Lets a frame size itself from the real image. */
export function screenRatio(key: string): number | null {
  const s = screen(key);
  return s ? s.width / s.height : null;
}
