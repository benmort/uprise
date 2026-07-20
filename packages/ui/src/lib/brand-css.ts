/**
 * Brand CSS helpers — turn a tenant's `OrgProfile` brand fields (a headline colour, a
 * secondary colour, and an optional block of custom CSS) into a SAFE `<style>` payload
 * that renders on the tenant's own public surfaces (poll viewer, volunteer join, field).
 *
 * Two jobs:
 *  1. `brandVarsCss` maps the brand colours onto the design-system tokens so they actually
 *     take visual effect — `--primary` is stored as HSL *channels* (`H S% L%`), so a hex
 *     must be converted; the raw hexes are also exposed as `--brand-primary/-secondary`
 *     for custom CSS to reference.
 *  2. `sanitizeBrandCss` neutralises the injection vectors that matter when author-supplied
 *     CSS is dropped inside a `<style>` on OUR domains: the `</style>` breakout, `@import`,
 *     network `url()` beacons, and the legacy script-in-CSS vectors (`expression()`,
 *     `-moz-binding`, `behavior:`, `javascript:`).
 *
 * The colour override is deliberately global (not scoped) — brand overriding OUR tokens on
 * the tenant's own surface is the point. Safety comes from the sanitiser, not from scoping.
 */

/** Parse `#rgb`/`#rrggbb` → `{r,g,b}` (0-255); null for anything else (rgb()/named/vars). */
function parseHex(input: string): { r: number; g: number; b: number } | null {
  const hex = input.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.replace(/(.)/g, "$1$1") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Hex colour → design-system HSL channel string `"H S% L%"` (the shape `--primary` holds,
 * consumed as `hsl(var(--primary))`). Null when the input isn't a hex we can convert.
 */
export function hexToHslChannels(input: string): string | null {
  const rgb = parseHex(input);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Perceived-luminance pick of a readable foreground (DS HSL channels) for a solid `hex`
 * background: dark ink on light brand colours, white on dark ones. Uses the YIQ approximation
 * (0-255). Null when the input isn't a hex we can parse.
 */
export function readableForegroundChannels(input: string): string | null {
  const rgb = parseHex(input);
  if (!rgb) return null;
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq >= 140 ? "222 47% 11%" : "0 0% 100%";
}

/**
 * The `:root { … }` rule that maps the brand colours onto the DS tokens. Overrides `--primary`
 * from `primaryColour` and `--secondary` (+ a contrast-picked `--secondary-foreground`) from
 * `secondaryColour` when they convert cleanly, and always exposes both as `--brand-primary`/
 * `--brand-secondary` hex vars for custom CSS. So `bg-primary` / `bg-secondary` on a tenant's
 * own surface (field, poll viewer, join) wear the tenant's brand colours. Returns "" when
 * nothing is set (so callers can skip the `<style>`).
 */
export function brandVarsCss(brand: {
  primaryColour?: string | null;
  secondaryColour?: string | null;
}): string {
  const decls: string[] = [];
  const primary = brand.primaryColour?.trim();
  const secondary = brand.secondaryColour?.trim();
  if (primary) {
    decls.push(`--brand-primary: ${primary};`);
    const channels = hexToHslChannels(primary);
    if (channels) decls.push(`--primary: ${channels};`);
  }
  if (secondary) {
    decls.push(`--brand-secondary: ${secondary};`);
    const channels = hexToHslChannels(secondary);
    if (channels) {
      decls.push(`--secondary: ${channels};`);
      const fg = readableForegroundChannels(secondary);
      if (fg) decls.push(`--secondary-foreground: ${fg};`);
    }
  }
  return decls.length ? `:root{${decls.join("")}}` : "";
}

/**
 * Sanitise author-supplied custom CSS for injection inside a `<style>` on our domains.
 * Defence-in-depth: strip comments first (they hide token-splitting evasions), then remove
 * every dangerous construct. What survives is plain declarative CSS.
 */
export function sanitizeBrandCss(css: string | null | undefined): string {
  if (!css) return "";
  let out = css;
  // 1. Strip CSS comments — prevents `@im/​**/​port`, `url/​**/​(…)` token-splitting evasions.
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  // 2. Kill the `</style>` breakout (and any stray HTML tag start). `<` is never valid CSS;
  //    dropping it leaves `>` for child combinators intact. This is the critical XSS guard.
  out = out.replace(/</g, "");
  // 3. Remove @import / @charset / @namespace (network fetches + parser games).
  out = out.replace(/@(?:import|charset|namespace)[^;{]*;?/gi, "");
  // 4. Neutralise every url(...) — the customCss brand-override use case is colours/spacing,
  //    not images, and url() is the beacon/exfil + external-font vector.
  out = out.replace(/url\s*\([^)]*\)/gi, "none");
  // 5. Legacy script-in-CSS vectors.
  out = out.replace(/expression\s*\([^)]*\)/gi, "");
  out = out.replace(/(?:-moz-binding|behavior)\s*:[^;}]*/gi, "");
  // 6. Dangerous URL schemes anywhere left over.
  out = out.replace(/javascript\s*:/gi, "");
  out = out.replace(/vbscript\s*:/gi, "");
  return out.trim();
}
