/**
 * Uprise wordmark. Self-contained (no raster asset) so the brand renders crisply
 * at any size. `large` is used on the login screen; the default suits the sidebar.
 */
export function Logo({ large = false, className }: { large?: boolean; className?: string }) {
  return (
    <span
      className={`font-extrabold tracking-tight text-foreground ${large ? "text-3xl" : "text-2xl"} ${className ?? ""}`}
      aria-label="Uprise"
    >
      Uprise
    </span>
  );
}

/**
 * Uprise app mark — the capital "U" block (rounded square + white U), matching
 * the favicon (uprise-icon.svg). The block uses `currentColor`, so set its colour
 * with a text-* class (e.g. text-primary).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Uprise" className={className}>
      <rect width="32" height="32" rx="7.5" fill="currentColor" />
      <text
        x="16"
        y="23"
        textAnchor="middle"
        fontFamily="var(--font-outfit, Outfit, Helvetica, Arial, sans-serif)"
        fontSize="20"
        fontWeight="700"
        fill="#ffffff"
      >
        U
      </text>
    </svg>
  );
}
