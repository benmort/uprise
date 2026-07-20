/**
 * Field is a phone-first canvasser tool (GPS, offline map pack, one-handed door logging).
 * Two nudges flow from that, decided here (pure + framework-free so they unit-test without a
 * DOM; the wiring lives in components/field-install-notice):
 *   - non-touch desktop          → "open it on your phone" (with a scan-to-open QR)
 *   - phone/tablet in a browser   → "install to your home screen" (offline-first PWA)
 * Tablets count as handheld (touch) and are treated like phones — they get the install
 * nudge, not the desktop one. Super-admins (QA on desktop) and the already-installed
 * standalone app see neither.
 */

/** At/below this CSS px width the viewport is treated as a phone. */
export const MOBILE_MAX_WIDTH = 768;

/** True when the viewport is phone-sized. `width <= 0` (unknown) is treated as mobile so a
 *  bad measurement never wrongly blocks a real phone. */
export function isMobileViewport(width: number): boolean {
  return width <= 0 || width <= MOBILE_MAX_WIDTH;
}

/** Phones AND tablets — a handheld: a touch device (coarse pointer), or a phone-sized viewport.
 *  These are all "fine to canvass on"; only a non-touch desktop is nudged onto a phone. */
export function isHandheld(opts: { isTouch: boolean; width: number }): boolean {
  return opts.isTouch || isMobileViewport(opts.width);
}

export type PwaPlatform = "ios" | "android" | "desktop";

/** Coarse device platform from a user-agent — drives the install instructions (iOS installs
 *  via Share → Add to Home Screen; Android/Chromium can use the install prompt). iPadOS 13+
 *  reports as "Macintosh"; the DOM caller refines that with a touch-points check. */
export function detectPlatform(ua: string): PwaPlatform {
  const s = (ua || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return "ios";
  if (/android/.test(s)) return "android";
  return "desktop";
}

export type FieldNoticeMode = "none" | "use-phone" | "install";

/**
 * Which nudge (if any) to show on a field screen: nothing for super-admins, the installed
 * standalone app, or a dismissed session; otherwise "install" on a handheld (phone/tablet)
 * browser and "use-phone" on a non-touch desktop.
 */
export function fieldNoticeMode(opts: {
  isTouch: boolean;
  width: number;
  isSuperAdmin: boolean;
  isStandalone: boolean;
  dismissed: boolean;
}): FieldNoticeMode {
  if (opts.isSuperAdmin || opts.isStandalone || opts.dismissed) return "none";
  return isHandheld({ isTouch: opts.isTouch, width: opts.width }) ? "install" : "use-phone";
}
