import { brandVarsCss, sanitizeBrandCss } from "../lib/brand-css";

export type BrandStyleFields = {
  primaryColour?: string | null;
  secondaryColour?: string | null;
  customCss?: string | null;
};

/**
 * Injects a tenant's brand styling on ITS OWN public surfaces (poll viewer, volunteer join,
 * field). Emits one `<style>`: the brand colours mapped onto the design-system tokens
 * (so they take visual effect), followed by the tenant's custom CSS run through
 * `sanitizeBrandCss`. Renders nothing when the tenant has set no brand styling.
 *
 * Isomorphic (no hooks) so it drops into server AND client trees. The payload is sanitised
 * — no `<`, no `@import`, no network `url()`, no legacy script-in-CSS — so
 * `dangerouslySetInnerHTML` here carries only declarative CSS. React would otherwise
 * entity-escape `>` inside `<style>` and break child combinators, hence the raw insert.
 */
export function BrandStyle({ brand }: { brand?: BrandStyleFields | null }) {
  if (!brand) return null;
  const vars = brandVarsCss(brand);
  const custom = sanitizeBrandCss(brand.customCss);
  const css = [vars, custom].filter(Boolean).join("\n");
  if (!css) return null;
  return <style data-tenant-brand dangerouslySetInnerHTML={{ __html: css }} />;
}
