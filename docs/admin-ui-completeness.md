# Admin UI completeness + onboarding port map

Status of every **active** admin UI page – the 47 pages **not** in the Future menu section – after the green-light pass, plus the map of onboarding pieces ported from prog.

_Updated 2026-07-05. Reflects the green-light build (WS1–WS4)._

## Headline

**47 active pages · 47 ✅ · 0 🟡 · 0 🟠 · 0 🔴.**

Every page is wired to the real typed API, handles the four feedback states (loading / empty / error / no-permission), and has no mock data or dead buttons. The features that were missing (turf delete, walk-list unassign/reassign, QA flag resolve, integrations connect/disconnect, contact edit) are built.

**Validation status:** statically verified – `pnpm -r typecheck` (15/15 projects), `pnpm --filter api test` (70 suites / 601 tests incl. the DI boot smoke), and the admin Next build all pass. A manual runtime walk of each surface is still recommended before calling it battle-tested; nothing here has been exercised in a running app yet.

## What the green-light pass changed

- **Feedback-state sweep** – migrated the swallowing pages onto the shared `useApi` + `StateRegion` helpers (`src/lib/use-api.ts`, `src/components/shell/state-region.tsx`), so a failed initial GET now shows an error (with retry) and a 403 shows a real no-permission state instead of an empty/stale surface. Fixed the `/canvass/[id]/qa` false "all clear".
- **Inbox** – emptied the mock channel seed, removed the no-op bulk/detail buttons, added list loading/error/no-permission, opened the leaf to organisers, and repointed the ~9 `/future/sms-inbox` CTAs to `/inbox`.
- **Feature builds** – new API endpoints + UI for turf delete, walk-list unassign/reassign, QA flag resolve/dismiss (new `QaFlagResolution` model), integrations connect/test/disconnect/reconnect/remove, and contact profile edit.
- **Security fold-in** – added `@RequirePermission` to the integrations + contacts controllers (they were undecorated – any authenticated user could reach them).

## Master list (domain → page)

| Domain / Page | Route | Verdict | Note |
|---|---|---|---|
| **Dashboard / Analytics / Account / Profile** | | | |
| Dashboard | `/dashboard` | ✅ | 6 module cards, 8s poll, plan-gated; dismissible onboarding nudge |
| Getting started | `/getting-started` | ✅ | Onboarding API + 5 live-derived steps, `StepProgress`, four states |
| Analytics | `/analytics` | ✅ | KPI/trend/activity + SSE; no-permission state added |
| Account | `/account` | ✅ | Email/password/2FA/sessions; initial-load error state added |
| Profile | `/profile` | ✅ | Real profile + avatar CRUD |
| **Blasts / Composer / Text** | | | |
| Blast details | `/blasts/[id]` | ✅ | KPIs + SSE + retry; no-permission added; CTAs → `/inbox` |
| Blast composer | `/blasts/[id]/composer` | ✅ | Initial-fetch skeleton + no-permission added |
| Composer shim | `/composer` | ✅ | Intentional redirect |
| Text channel | `/channels/text` | ✅ | KPI header now has loading + error state |
| **Canvass – core** | | | |
| Overview | `/canvass` | ✅ | Campaigns/turf, create/edit dialog, switcher |
| Campaigns index | `/canvass/campaigns` | ✅ | Real listing, all states |
| New campaign | `/canvass/new` | ✅ | Functional create; deep-linkable quick-create alongside the overview dialog |
| Volunteers | `/canvass/volunteers` | ✅ | Migrated to `useApi`+`StateRegion` |
| **Canvass – campaign tabs** | | | |
| Goals & pace | `/canvass/[id]/goals` | ✅ | Hardened; conversation-pace bar added (funnel.contacted) |
| Boundary | `/canvass/[id]/boundary` | ✅ | Error + no-permission states added to the editor load |
| Cut turf | `/canvass/[id]/turf` | ✅ | `useApi`; **turf delete** (ConfirmDialog) added |
| Walk lists | `/canvass/[id]/walklists` | ✅ | Hardened; **unassign + reassign** (volunteer picker) added |
| Live | `/canvass/[id]/live` | ✅ | `useApi` polling; no longer stale-on-error; no-permission added |
| Data quality (QA) | `/canvass/[id]/qa` | ✅ | False all-clear fixed; **resolve/dismiss + undo** added |
| Results | `/canvass/[id]/results` | ✅ | `useApi`+`StateRegion`; CSV export kept |
| Shifts | `/canvass/[id]/shifts` | ✅ | Migrated to `useApi`; full CRUD |
| **Inbox / Contacts / Audience** | | | |
| Inbox | `/inbox` | ✅ | Real SMS/WhatsApp only; loading/error/no-permission added |
| Inbox folder | `/inbox/[folder]` | ✅ | Same, mock bulk actions removed |
| Inbox thread | `/inbox/[folder]/[channel]/[uid]` | ✅ | Mock surfaces + no-op buttons removed; no-permission added |
| Contact profile | `/contacts/[id]` | ✅ | **Edit form** added; "Send text" → `/inbox` |
| Audience list | `/audience` | ✅ | Real CRUD + CSV import + Action Network + WhatsApp opt-in |
| Audience detail | `/audience/[id]` | ✅ | Re-query loading indicator added |
| **Engagement** | | | |
| Library hub | `/engagement` | ✅ | Static link grid |
| Surveys | `/engagement/surveys` | ✅ | Migrated to `useApi`+`StateRegion` |
| Scripts | `/engagement/scripts` | ✅ | Migrated to `useApi`+`StateRegion` |
| Dispositions | `/engagement/dispositions` | ✅ | Migrated to `useApi`+`StateRegion` |
| Canned responses | `/engagement/canned-responses` | ✅ | Two `useApi` loads + `StateRegion` |
| **Data / Geo** | | | |
| Datasets | `/data/datasets` | ✅ | Real geo status + re-ingest |
| File Manager | `/data/file-manager` | ✅ | Upload/list/delete + storage donut |
| Areas explorer | `/data/areas` | ✅ | Server-paged |
| Divisions explorer | `/data/divisions` | ✅ | `useApi` + `StateRegion` |
| Addresses explorer | `/data/addresses` | ✅ | Real G-NAF; free-text search needs `NEXT_PUBLIC_MAPBOX_TOKEN` (deploy config) |
| States explorer | `/data/states` | ✅ | Real, all states |
| Area detail | `/data/areas/[layer]/[code]` | ✅ | Migrated to `useApi`; no-permission + retry added |
| Division detail | `/data/divisions/[type]/[code]` | ✅ | Same as area detail |
| **Settings / Compliance** | | | |
| General hub | `/settings` → `/future/tenant-settings` | ✅ | 11-tab hub |
| Team | `/settings/team` | ✅ | Full member/invite/join-request CRUD |
| Integrations | `/settings/integrations` | ✅ | **Connect/test/disconnect/reconnect/remove** + four states added |
| Plans (super-admin) | `/settings/plans` | ✅ | Full plan CRUD |
| Feature flags (super-admin) | `/settings/flags` | ✅ | Tri-state overrides |
| Queues (super-admin) | `/settings/queues` | ✅ | BullMQ/Redis stats |
| Compliance | `/compliance` | ✅ | Opt-out ledger (read-only by design) |

## Backend added (this pass)

- `QaFlagResolution` model + migration `20260705130000_qa_flag_resolution` (canvass schema).
- Canvass endpoints (organiser, `@Roles`): `DELETE /canvass/turfs/:id`, `POST /canvass/turfs/:id/unassign`, `POST /canvass/turfs/:id/reassign`, `POST /canvass/campaigns/:id/qa/resolve`.
- Integrations (`@RequirePermission integration.all`): `PATCH`/`DELETE /integrations/connections/:id`, plus decorators on the existing routes.
- Contacts (`@RequirePermission contacts.contact`): `PATCH /contacts/:id`, plus decorators on the existing routes.

## Onboarding port map (prog → admin)

| Piece | Where it is now | State |
|---|---|---|
| **`StepProgress` (the "process bar")** | `packages/ui/src/components/step-progress.tsx` | ✅ Reused in `/getting-started` + dashboard nudge |
| Organiser getting-started page | `src/app/(main)/getting-started/page.tsx` | ✅ Shipped |
| Onboarding tracking | `Tenant.onboarding` + `/tenants/:id/onboarding` | ✅ Shipped |
| `prog/ui/progress.tsx` | – | ✅ Deleted (dead) |
| Volunteer wizard / org sign-up / FieldOnboarding / product tour | auth app + `@uprise/ui` + tours | Live; left in place |

## Notes

- Consent editing on the contact profile is intentionally out of scope (compliance-sensitive; flows from opt-out/STOP).
- The guided product tour steps still point at the parked `/future/sms-inbox` (a demo surface) rather than `/inbox`; left as-is.
- Contact edit doesn't yet prefill tags (the profile read doesn't return them); the backend supports `tags`.
