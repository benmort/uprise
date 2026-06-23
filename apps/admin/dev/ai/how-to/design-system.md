---
name: design-system
description: How to style yarns frontends – @yarns/ui tokens and primitives are the single source of truth.
layer: web
topic: styling
use_when: Building or restyling any web UI, picking a colour, or adding a design token.
last_reviewed: 2026-06-23
---

# Design system

Every yarns frontend renders from one shared design system – `@yarns/ui` – consumed as source, never re-themed ad hoc.

Canonical: `packages/ui/globals.css` (Tailwind v4 CSS-first: `:root` HSL channel vars, `@theme inline` colour mapping, `@custom-variant dark`), `packages/ui/src/components/*` (e.g. `button.tsx` `buttonVariants` CVA, `status-badge.tsx`, `empty-state.tsx`, `skeleton.tsx`), `apps/admin/src/app/globals.css`, `apps/admin/postcss.config.js`, `apps/admin/next.config.mjs` (`transpilePackages`).

## Must have
- Treat `@yarns/ui` as the source of truth. Import primitives via the app shim `@/components/ui/*` (which re-exports `@yarns/ui`) – `Button`, `StatusBadge`, `EmptyState`, `Skeleton`, `Field`, `FormDialog`, etc. Do not hand-roll a primitive that already exists.
- Consume the package from source – no build step. `apps/admin/next.config.mjs` lists `@yarns/ui` in `transpilePackages`; editing `packages/ui/src` is live in dev.
- An app imports the tokens once: `@import "tailwindcss";` then `@import "@yarns/ui/globals.css";` in its own `globals.css`, plus an `@source` line pointing at `packages/ui/src/**/*.{ts,tsx}` so Tailwind v4 scans the shared classes.
- Use the design tokens via utilities – `bg-primary`, `text-foreground`, `bg-warning-container text-warning-foreground`, `bg-surface`, `border-border`, the support-scale and `knock` tokens. Never a raw hex value.
- Extend the palette by adding an HSL channel var in `:root` and mapping it in `@theme inline` (e.g. `--color-x: hsl(var(--x))`) – keep channels in `:root` so a future `.dark`/per-tenant block can re-skin every utility.
- Use the design-system utilities for layout/motion: `page-stack`, `section-stack`, `surface-muted`, `animate-fade-up`, `shadow-card`, `tabular-nums` on anything counted.

## Anti-patterns
- Raw hex/rgb in className (e.g. `text-[#b45309]`) instead of `text-warning-foreground`. The handful of `[hsl(var(--x))]` literals in existing code are tokens already, not new colours.
- Forking a UI primitive into `apps/admin` instead of fixing or extending `@yarns/ui`.
- Adding a colour utility without a matching `:root` channel var (breaks future re-skinning).
- Using `--tertiary` as a warning – it reads salmon/error; warning is `--warning-container` + `--warning-foreground` (amber).
- Building a `dist` for `@yarns/ui` and importing that – it ships TS/TSX source via `transpilePackages`.

## Checklist
- [ ] Reused a `@yarns/ui` primitive (or extended the package), not a local fork.
- [ ] Colours come from tokens; zero new raw hex in className.
- [ ] Any new token added as a `:root` channel var and mapped in `@theme inline`.
- [ ] The Next app builds (the real gate for Tailwind v4 / `@source` changes).
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/admin/dev/ai/how-to/feedback-states.md` – the four states built from these primitives.
- `apps/admin/dev/ai/how-to/app-router-and-api-client.md` – where these components fetch their data.
