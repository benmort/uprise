/**
 * Legible text colour (dark ink `#111827` or white) for a hex background, by WCAG relative
 * luminance. Used to pick CTA/label text over a tenant's brand-colour fill. Returns undefined
 * for a non-hex input so the caller can fall back to a token colour.
 */
export function readableOn(hex?: string | null): string | undefined {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const chan = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
  return luminance > 0.5 ? "#111827" : "#ffffff";
}
