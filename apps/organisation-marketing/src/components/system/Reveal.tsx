/**
 * Re-export of the shared `Reveal` — the implementation now lives in `@uprise/ui` so the product
 * marketing site can use the same one instead of a second copy.
 *
 * Safe to take from the design system even though this app deliberately avoids `@uprise/ui`'s form
 * components (see `components/forms/fields.tsx`): `Reveal` carries no tokens and no classes, only
 * inline opacity/transform, so it brings none of the product theme with it.
 *
 * Kept as a local module rather than rewriting the 13 call sites' imports.
 */
export { Reveal, type RevealProps } from "@uprise/ui";
