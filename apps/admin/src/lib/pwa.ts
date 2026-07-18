// PWA install helpers. Kept pure + framework-free so they unit-test without a DOM; the
// browser-facing state (beforeinstallprompt capture, standalone detection) lives in the
// use-pwa-install hook.

export type PwaPlatform = "ios" | "android" | "desktop";

/**
 * Coarse device platform from a user-agent string. Drives install guidance: iOS can't use
 * the `beforeinstallprompt` API — it installs via Share → Add to Home Screen — whereas
 * Android/desktop Chromium can prompt. iPadOS 13+ masquerades as "Macintosh"; the hook
 * refines that with a touch-points check, so this string-only pass returns "desktop" for it.
 */
export function detectPlatform(ua: string): PwaPlatform {
  const s = (ua || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return "ios";
  if (/android/.test(s)) return "android";
  return "desktop";
}

/** Where the installed app lives on each platform — the "how do I open it" hint, since no
 *  browser exposes an API to launch an installed PWA from a tab. */
export function openHint(platform: PwaPlatform): string {
  switch (platform) {
    case "ios":
      return "Open Uprise from your Home Screen.";
    case "android":
      return "Open Uprise from your app drawer or home screen.";
    default:
      return "Open Uprise from your dock, taskbar or app launcher.";
  }
}
