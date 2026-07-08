/**
 * Seamless marquee: the content is rendered twice on a w-max inline-flex track
 * (second copy aria-hidden) and the track translates by -50% on loop — the
 * design's `marq`/`marqR` pattern.
 */
export function Marquee({
  children,
  reverse = false,
  durationS = 26,
  className,
}: {
  children: React.ReactNode;
  /** Reverse direction (the footer band). */
  reverse?: boolean;
  durationS?: number;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden ${className ?? ""}`}>
      <div
        className="flex w-max"
        style={{ animation: `${reverse ? "marqR" : "marq"} ${durationS}s linear infinite` }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
