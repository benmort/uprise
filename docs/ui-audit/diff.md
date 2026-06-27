# UI audit — dev vs design

Captured every route with seeded demo data (`docs/ui-audit/dev/*.png`) and compared
against the design reference: the 3 zip screenshots (`docs/ui-audit/design/*.png` —
Dashboard, Inbox, Audience), the `Uprise Canvassing.dc.html` prototype, and the
handoff README token spec.

**Headline: the app is overwhelmingly on-design** — the surfaces were built to the
README, so tokens (royal-blue `#2f5bd6`, Open Sans, card radii/shadows), the sidebar +
"Create Blast" shell, KPI tiles, tables and the dual-channel survey all match the
reference. Base pages (dashboard/inbox/audience) are pixel-consistent with the 3
screenshots (they're the same app). The fixes below are the genuine drifts found.

## Fixes applied

| Surface | Discrepancy vs design | Fix |
|---|---|---|
| **A3 Door entry** (`disposition-pad`) | All contact-result codes rendered as identical dark buttons; design wants the **"Spoke to …"** action visually prominent (green) leading to the survey, with no-contact outcomes a neutral grid. | Split the pad: `spoke_*` → full-width **green** (`success`) buttons; other contact results → neutral grid. |
| **A3 / Journeys / badges** (`tailwind.config.ts` + `globals.css` token) | Tailwind's `warning.{DEFAULT,container,foreground}` mapped to the **red** `--tertiary-*` vars, so terminal disposition codes and the journey **Wait** node read as *errors*. | Set `globals.css` `--warning-container`/`--warning-foreground` to the design **amber** (`#fef3e2`/`#b45309`) **and** repointed `tailwind.config.ts` `warning` → those vars. Fixes the door pad terminal row, the journeys Wait node, and every warning badge app-wide. (Tailwind-config change needs a dev-server restart to show live.) |
| **A3 terminal row** | Labelled "Data quality" only. | Relabelled "Terminal / data quality" with the design's uppercase micro-label + divider. |
| **Button kit** | No green/success action existed (the design uses green for the affirmative door action). | Added a reusable `success` button variant. |

## Verified on-design (no change needed)

- **B1 Canvass overview** — switcher, 4 shadow-card KPI tiles, turf card w/ map
  thumbnail + green progress + status chip + Manage.
- **A1/A2 Field** — greeting + stat tiles + sync chip; List/Map toggle, green progress,
  prominent next-stop CTA, dimmed visited rows, first-run onboarding pop-in.
- **C2 Surveys** — dual-channel editor (door label / SMS reply / disposition) + the live
  "At the door" / "As a text reply" preview with disposition logging.
- **D Journeys** — node-flow builder (Trigger→Wait→Action), palette, dry-run/activate.
- **Dashboard / Inbox / Audience** — match the 3 reference screenshots exactly.

## 2026-06-18 refresh (post amber fix + cascade + deferred gaps)

Re-captured all surfaces against a clean prod build. Confirmed:
- **A3 door pad** now renders the design: green "Spoke to …", neutral no-contact grid,
  **amber** Terminal/Data-quality row (was red).
- **Cascade sidebar** (`sidebar-cascade.png`) matches the prototype (groups + rail + dots).
- The three deferred gaps now built: **E2** server-owned inbox ownership (claim/release),
  **G3** door photo upload (`@vercel/blob`, gated on `BLOB_READ_WRITE_TOKEN`), **G14**
  push-to-field (web-push + VAPID + SW handler + `/field/me` enable + live-room "Notify field").

## Notes

- A transient "1 error" dev indicator appeared on field captures; a clean reload with
  console capture produced **no** `console.error`/`pageerror` — not a runtime defect.
- E2 inbox door-chips/"View contact" only render when the thread's phone matches a
  Contact; the seeded demo numbers don't collide with the existing inbox threads, so
  it's not visible in `inbox.png` (component is wired + builds).
- Capture harness: `node apps/admin/scripts/capture-surfaces.mjs` (needs web :3000, API
  :3001, `npm --prefix apps/api run seed:demo`).
- **Do not run `next build` while `next dev` is live** — they share `.next` and the
  build clobbers the dev server's vendor chunks ("Cannot find module
  ./vendor-chunks/…"). Recover by restarting the dev server. `A3-door.png` was
  re-captured during that collision; re-run the harness after a dev restart for a
  clean amber-terminal shot.
