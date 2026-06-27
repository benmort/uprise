---
name: feedback-states
description: Every data surface handles four states – loading, empty, error, no-permission – using the shared @uprise/ui primitives.
layer: web
topic: ux
use_when: Building any page or component that fetches data or renders a list/detail view.
last_reviewed: 2026-06-23
---

# Feedback states

A surface that fetches data is not done until it answers all four questions: is it loading, is there nothing, did it fail, am I allowed? Render an explicit branch for each.

Canonical: `packages/ui/src/components/skeleton.tsx` (`Skeleton`), `packages/ui/src/components/empty-state.tsx` (`EmptyState` – title/description/CTA), `packages/ui/src/components/toast.tsx` (`useToast` for transient errors), `packages/ui/src/components/status-badge.tsx`, `apps/admin/src/app/(main)/canvass/canvassers/page.tsx` (the `loading` flag + `ApiResult.ok` branch house pattern).

## Must have
- **Loading** – show a `Skeleton` (or a clearly-labelled placeholder) while the first fetch is in flight; track a `loading` boolean that clears in the resolve path. Don't flash an empty state before data arrives.
- **Empty** – when the fetch succeeds with zero rows, render `EmptyState` with a real title, a one-line description, and (where sensible) the CTA that creates the first item. Empty is a success, not an error.
- **Error** – when `ApiResult.ok` is false, surface `res.error`: a `useToast({ tone: "error" })` for an action, or an inline error block for a whole-page load. Never silently swallow a failed result or show an infinite spinner.
- **No-permission** – when the principal/ability says the user can't see or do this, render a hide-or-explain state rather than a broken control or a raw 403 (see `apps/admin/dev/ai/how-to/permission-gating.md`). Default to hiding the surface for read-gating.
- Keep it principle-level and consistent: same primitives, same order of checks (permission → loading → error → empty → data) on every surface.

## Anti-patterns
- A spinner with no error or timeout path – a failed fetch spins forever.
- Treating empty-list as an error (red text, scary copy) or vice versa.
- Rendering data optimistically before `res.ok` is checked, then crashing on `res.error`.
- Swallowing `res.error` (no toast, no inline message) so failures are invisible.
- A one-off bespoke spinner/empty card instead of `Skeleton` / `EmptyState`.

## Checklist
- [ ] Surface renders distinct loading, empty, error and no-permission branches.
- [ ] Loading uses `Skeleton`; empty uses `EmptyState`; errors reach the user (toast or inline).
- [ ] `ApiResult.ok` is checked before reading data.
- [ ] No infinite-spinner / swallowed-error path.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/admin/dev/ai/how-to/app-router-and-api-client.md` – the `ApiResult` union these states branch on.
- `apps/admin/dev/ai/how-to/permission-gating.md` – the no-permission state.
- `apps/admin/dev/ai/how-to/design-system.md` – the primitives used to render each state.
