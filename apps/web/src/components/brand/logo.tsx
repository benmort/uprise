/**
 * Foment wordmark. Self-contained (no raster asset) so the brand renders crisply
 * at any size. `large` is used on the login screen; the default suits the sidebar.
 */
export function Logo({ large = false, className }: { large?: boolean; className?: string }) {
  return (
    <span
      className={`font-extrabold tracking-tight text-foreground ${large ? "text-3xl" : "text-2xl"} ${className ?? ""}`}
      aria-label="Foment"
    >
      Foment
    </span>
  );
}
