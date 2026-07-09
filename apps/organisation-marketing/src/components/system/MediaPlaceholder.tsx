import Image from "next/image";

/**
 * The design's image slot: a real screenshot when `src` is given, otherwise a dark
 * ink block with a faint diagonal stripe pattern and a mono bracketed caption (the
 * placeholder awaiting a screenshot in the content pass).
 */
export function MediaPlaceholder({
  caption,
  ratio = "16/10",
  topRight,
  className,
  src,
  alt,
}: {
  /** e.g. "[ RIVERA FOR SENATE — HERO SCREENSHOT ]" */
  caption: string;
  /** CSS aspect-ratio, e.g. "16/10", "4/5". */
  ratio?: string;
  /** Small mono label pinned top-right (e.g. the project year). */
  topRight?: string;
  className?: string;
  /** A real image (public path). When set, the screenshot fills the slot instead of the placeholder pattern. */
  src?: string;
  /** Alt text for the image; falls back to the caption. */
  alt?: string;
}) {
  if (src) {
    return (
      <div
        className={`relative overflow-hidden rounded-card ${className ?? ""}`}
        style={{ aspectRatio: ratio }}
      >
        <Image
          src={src}
          alt={alt ?? caption}
          fill
          sizes="(max-width: 900px) 100vw, 900px"
          className="object-cover"
        />
        {topRight ? (
          <span className="absolute right-4 top-3 font-mono text-xs text-cream/70">{topRight}</span>
        ) : null}
      </div>
    );
  }
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
