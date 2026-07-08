/**
 * The design's deliberate image slot: a dark ink block with a faint diagonal
 * stripe pattern and a mono bracketed caption. Real screenshots/portraits land
 * here in the content pass.
 */
export function MediaPlaceholder({
  caption,
  ratio = "16/10",
  topRight,
  className,
}: {
  /** e.g. "[ RIVERA FOR SENATE — HERO SCREENSHOT ]" */
  caption: string;
  /** CSS aspect-ratio, e.g. "16/10", "4/5". */
  ratio?: string;
  /** Small mono label pinned top-right (e.g. the project year). */
  topRight?: string;
  className?: string;
}) {
  return (
    <div
      className={`stripe-placeholder relative flex items-center justify-center overflow-hidden rounded-card ${className ?? ""}`}
      style={{ aspectRatio: ratio }}
    >
      {topRight ? (
        <span className="absolute right-4 top-3 font-mono text-xs text-cream/40">{topRight}</span>
      ) : null}
      <span className="px-4 text-center font-mono text-xs tracking-[0.08em] text-cream/40">
        {caption}
      </span>
    </div>
  );
}
