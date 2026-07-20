// Is the field app running as an INSTALLED / standalone PWA (home-screen icon), rather than
// a browser tab? The installed app is the one that should auto-download turfs and behave
// fully offline-first. Single source of truth — the inline copy in field-install-notice
// consumes this. SSR-safe (false when there's no window).

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
