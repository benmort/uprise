// Is the device on a connection fast/unmetered enough to auto-download large turf map packs
// without burning a volunteer's mobile data? Used to gate the installed app's background
// auto-download (the one-tap Download button ignores this — a tap is the volunteer opting in).
//
// The Network Information API is Chromium-only; iOS Safari has neither `connection` nor
// `effectiveType`. Because auto-download is already gated on the app being INSTALLED (a
// deliberate offline intent), once-per-session, and bounded to the few assigned turfs, we
// default to ALLOW when the API is absent rather than silently disabling the feature on the
// largest field platform. `saveData` (Data Saver / Low Data Mode) is an absolute opt-out
// wherever it's reported.

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

export function isFastConnection(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (conn?.saveData) return false; // explicit opt-out — never auto-download
  if (!conn || conn.effectiveType == null) return true; // API absent (iOS) → allow
  return conn.effectiveType === "4g"; // wifi + 4g report "4g"; 3g/2g/slow-2g → one-tap only
}
