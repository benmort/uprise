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
      className={`home-sechead home-rise${align === "centre" ? " home-sechead--mid" : ""}`}
      style={cssVars({ "--d": `${delayMs}ms` })}
    >
      <span className="home-mono home-eyebrow">{eyebrow}</span>
      <h2 className="home-h2">{title}</h2>
      {lede ? <p className="home-lede">{lede}</p> : null}
    </header>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="home-chip">{children}</span>;
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
    <div className="home-mock">
      <div className="home-mockbar">
        <span className="home-mono">{label}</span>
        <span className="home-mono">{meta}</span>
      </div>
      <div className="home-mockbody">{children}</div>
    </div>
  );
}
