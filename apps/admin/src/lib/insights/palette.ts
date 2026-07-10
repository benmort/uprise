/**
 * The bridge between `@uprise/ui`'s design tokens and ApexCharts.
 *
 * Apex takes colours as hex strings in `options.colors` and then does arithmetic on
 * them — shading, gradient stops, `hexToRgba` — which assumes a hex literal. It cannot
 * consume `hsl(var(--poll-support-strong))`. The design system, meanwhile, forbids a
 * hardcoded hex anywhere. Both hold if we read the tokens at runtime and convert.
 *
 * This module is the pure half: given a function that resolves a CSS custom property to
 * its declared value, it hands back a palette of hex strings. It never touches
 * `document`, so it runs under vitest with a plain object as the reader. The DOM half —
 * reading `getComputedStyle` and re-reading when the theme flips — is the
 * `usePollPalette` hook, which is deliberately thin because it cannot be unit-tested.
 *
 * Getting this right is the point of the exercise: the reference dashboard we borrowed
 * these widgets from hardcodes `#465FFF` and `#6B7280` into every chart, so its charts
 * are the same colour in dark mode as in light. Ours follow the theme because they read
 * the same variables the rest of the page does.
 */

export type Hsl = { h: number; s: number; l: number };

/**
 * `"237.6 69% 50.6%"` → `{ h: 237.6, s: 69, l: 50.6 }`.
 *
 * This is Tailwind v4's channel-triple form, the shape every `--poll-*` token is stored
 * in so that `hsl(var(--x) / <alpha>)` works. Returns null for anything else — a token
 * that has been renamed away resolves to `""`, and a caller must fall back rather than
 * paint `NaN`.
 */
export function parseHslTriple(triple: string): Hsl | null {
  const m = /^\s*(-?[\d.]+)(?:deg)?\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(triple);
  if (!m) return null;
  const [h, s, l] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;
  return { h, s, l };
}

/** HSL → `#rrggbb`, clamping out-of-gamut input rather than emitting `NaN`. */
export function hslToHex({ h, s, l }: Hsl): string {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = lig - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio between two hex colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Whichever of two inks is more legible on `background`.
 *
 * Needed because a label printed on a chart's own fill cannot pick its colour from the
 * theme. The sequential ramp runs light→dark in the light theme and dark→light in the
 * dark one, so "use the surface colour for the top steps" is right in one theme and wrong
 * in the other. Measuring the fill answers it in both, and in any ramp added later.
 */
export function readableOn(background: string, a: string, b: string): string {
  return contrastRatio(background, a) >= contrastRatio(background, b) ? a : b;
}

/**
 * The tokens a chart may read. Named here once so a rename shows up as a type error at
 * every call site rather than a silently grey chart.
 */
export const POLL_TOKENS = {
  diverging: [
    "--poll-support-strong",
    "--poll-support-soft",
    "--poll-neutral",
    "--poll-oppose-soft",
    "--poll-oppose-strong",
  ],
  seq: ["--poll-seq-1", "--poll-seq-2", "--poll-seq-3", "--poll-seq-4", "--poll-seq-5"],
  accent: "--poll-accent",
  nodata: "--poll-nodata",
  ink: "--foreground",
  muted: "--muted-foreground",
  grid: "--border",
  surface: "--surface",
} as const;

type Five = [string, string, string, string, string];

export type PollPalette = {
  /** Strongly-positive → strongly-negative. Slot order matches `DIVERGING_SLOTS`. */
  diverging: Five;
  /** Low → high magnitude. */
  seq: Five;
  accent: string;
  nodata: string;
  ink: string;
  muted: string;
  grid: string;
  surface: string;
};

/**
 * Last-resort colours, used only when a token cannot be resolved — a stylesheet that
 * failed to load, or a token deleted from `globals.css` without updating this file.
 * They are the light-mode values, so a chart degrades to "readable but wrong theme"
 * rather than to invisible.
 */
const FALLBACK: PollPalette = {
  diverging: ["#2a31d8", "#6b7cff", "#e4e4e7", "#ea6248", "#c9351d"],
  seq: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"],
  accent: "#c9351d",
  nodata: "#e4e4e7",
  ink: "#09090b",
  muted: "#71717a",
  grid: "#e4e4e7",
  surface: "#ffffff",
};

/** Resolve one token to hex, falling back when it is missing or malformed. */
function hexOf(read: (name: string) => string, token: string, fallback: string): string {
  const parsed = parseHslTriple(read(token) ?? "");
  return parsed ? hslToHex(parsed) : fallback;
}

/**
 * Build the chart palette from whatever the reader resolves.
 *
 * `read` receives a custom-property name and returns its declared value, e.g.
 * `getComputedStyle(document.documentElement).getPropertyValue(name)`. Because it is a
 * parameter rather than a global, the whole conversion is testable in node.
 */
export function buildPollPalette(read: (name: string) => string): PollPalette {
  const five = (tokens: readonly string[], fallbacks: Five): Five =>
    tokens.map((t, i) => hexOf(read, t, fallbacks[i])) as Five;

  return {
    diverging: five(POLL_TOKENS.diverging, FALLBACK.diverging),
    seq: five(POLL_TOKENS.seq, FALLBACK.seq),
    accent: hexOf(read, POLL_TOKENS.accent, FALLBACK.accent),
    nodata: hexOf(read, POLL_TOKENS.nodata, FALLBACK.nodata),
    ink: hexOf(read, POLL_TOKENS.ink, FALLBACK.ink),
    muted: hexOf(read, POLL_TOKENS.muted, FALLBACK.muted),
    grid: hexOf(read, POLL_TOKENS.grid, FALLBACK.grid),
    surface: hexOf(read, POLL_TOKENS.surface, FALLBACK.surface),
  };
}
