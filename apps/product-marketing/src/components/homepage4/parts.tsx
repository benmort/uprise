import React from "react";

/**
 * The small shared pieces every section below the opening is built from — the section head, the
 * grey chip, and the mock card's label/meta strip. Server components: they carry no behaviour, only
 * the page's type scale and spacing, so a section that needs motion wraps itself in
 * <RevealScope /> rather than making these client.
 */

/** Inline CSS custom properties need a cast — React's CSSProperties has no index signature. */
export const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

export function SectionHead({
  eyebrow,
  title,
  lede,
  align = "centre",
  delayMs = 0,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: string;
  align?: "centre" | "left";
  delayMs?: number;
}) {
  return (
    <header
      className={`hp4-sechead hp4-rise${align === "centre" ? " hp4-sechead--mid" : ""}`}
      style={cssVars({ "--d": `${delayMs}ms` })}
    >
      <span className="hp4-mono hp4-eyebrow">{eyebrow}</span>
      <h2 className="hp4-h2">{title}</h2>
      {lede ? <p className="hp4-lede">{lede}</p> : null}
    </header>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="hp4-chip">{children}</span>;
}

/** A white card with the mono label/meta strip across the top — the frame every product mock uses. */
export function MockCard({
  label,
  meta,
  children,
}: {
  label: string;
  meta: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="hp4-mock">
      <div className="hp4-mockbar">
        <span className="hp4-mono">{label}</span>
        <span className="hp4-mono">{meta}</span>
      </div>
      <div className="hp4-mockbody">{children}</div>
    </div>
  );
}
