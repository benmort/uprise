# Admin UI comparison & prog consolidation strategy

## Context

The uprise admin (`apps/admin`) has two halves living side by side:

1. **A complete native organiser product** — Dashboard, Inbox, Channels (Text/WhatsApp), Canvass (8 screens), Engagement (surveys/scripts/dispositions/canned), Audience, Journeys, Compliance, Analytics, Settings, the Field PWA. All fully built and wired to the NestJS backend.
2. **A 28-page `/prog/*` sandbox** — placeholder UI scaffolding ported from the predecessor *prog* platform (`~/code/prog/clients/admin-client`, package `prognetwork`), gated to super-admins only. Almost all of it is stub/mock with no backend.

Meanwhile prog itself has deep, real functionality the uprise product lacks: Email & Calls channels, public Actions (forms/petitions/surveys/fundraisers), Events/Ladders/Calendar, Audience segmentation, Billing, Activity/audit, org Security, plus commerce (products/invoices/transactions/support) and a Developer Hub (API keys/webhooks/wrappers/shortlinks).

**Goal of this document:** a page-by-page comparison of the two admin UIs, a decision on what to merge/promote out of the super-admin Prog sandbox into the real product, and a mapping of every kept/ported feature to a **plan tier** and a **user role**. This is a strategy/decision doc — no code is staged.

## Scope & decisions

- **Deliverable:** strategy + mapping doc (compare → recommend → map to plans/roles). No implementation staged.
- **Prog scope folded in:** organising-core **+ commerce & dev**. In scope: Email/Calls channels, Events/Ladders/Calendar, Forms/Petitions/Surveys/Fundraisers, Audience segments/tags, Team/Billing/Activity/Security, **Business** (products/invoices/transactions/support tickets), **Developer Hub** (API keys/webhooks/wrappers/snippets/shortlinks). **Out of scope:** Grant Management suite, Support/KB/Trainings.
- **Prog sandbox intent:** *promote into product*. Worthwhile features move into the real nav sections, gated by plan + role; the catch-all super-admin **Prog** group is retired as features graduate.

## Source of truth for tiering

The seeded plans already declare the intended tiering via the public pricing table (`apps/api/src/shared-seed/plans.seed.ts` → `featureRows`, surfaced on marketing `/plans`). This doc maps features to those promises:

| Capability (pricing row) | Grassroots | Starter | Growth | Scale |
|---|---|---|---|---|
| Email campaigns | ✓ | ✓ | ✓ | ✓ |
| SMS campaigns | – | – | ✓ | ✓ |
| Calling campaigns | – | – | – | ✓ |
| Forms & petitions | ✓ | ✓ | ✓ | ✓ |
| Surveys & fundraisers | – | – | ✓ | ✓ |
| Advanced analytics | – | – | ✓ | ✓ |
| API access & priority support | – | – | – | ✓ |
| Contacts limit | 1,000 | 5,000 | 25,000 | 100,000 |
| Team members | 2 | 3 | 10 | 25 |
| Segments | 2 | 5 | 20 | ∞ |
| WhatsApp (featureFlags) | off | on | on | on |

⚠ **Reality check — sold vs built.** Several pricing rows advertise capabilities that aren't built yet: **campaigner Email**, **Calling**, **Forms & petitions**, **Surveys & fundraisers**, **Advanced analytics**. These must render as **"Coming soon" on `/plans`, visually differentiated** (muted/badged, not a plain tick) — never implied as live.

- **Email:** P1 ships **transactional email only** (system mail — magic links, receipts, notifications), which already exists. The **campaigner Email channel** (prog-style broadcasts/threads) is **not built and is not P1**, so it is *not* consolidated into Channels yet (see Parts A/B).
- **Text/SMS:** built, but pricing promises SMS only from **Growth** while the live nav has `FEATURE_NAV_CHANNELS_TEXT` default-ON for all tiers. Re-tier to Growth+ to match the page (or change the copy).

---

## Part A — Page-by-page comparison

Verdicts: **Keep** (uprise native, leave as-is) · **Merge** (consolidate prog into the uprise equivalent) · **Promote/Build** (surface a real feature where only a stub/nothing exists) · **Defer** · **Drop**.

### Already native — keep
| Area | uprise (built) | prog equivalent | Verdict |
|---|---|---|---|
| Dashboard | `/dashboard` (KPIs, modules, health) | `/admin` (ecommerce metrics) | **Keep** uprise; drop prog's ecommerce dash |
| Inbox | `/inbox` (rich 2-way, SLA, AI replies) | email inbox under Channels | **Keep** uprise |
| Canvass | 8 screens + Field PWA | none | **Keep** (uprise differentiator) |
| Journeys | `/journeys` automation builder | action-flow (grant mgmt only) | **Keep** uprise |
| Compliance | `/compliance` opt-out ledger | none | **Keep** uprise |
| Analytics (basic) | `/analytics` blast analytics | Reports/ApexCharts | **Keep**; advanced analytics = Build (below) |

### Channels — merge into one section
| Channel | uprise | prog | Verdict |
|---|---|---|---|
| Text/SMS | built (`/channels/text`) | — | **Keep** (re-tier to Growth+) |
| WhatsApp | built (`/channels/whatsapp`) | — | **Keep** (Starter+) |
| Email (campaigner) | stub (`/prog/email`) | real (threading, labels) | **Defer** — not P1; P1 email is transactional only |
| Calls | stub (`/prog/calls`) | real (Twilio, recordings) | **Promote/Build** later (Scale) |
| Chats / Social / Direct mail | stub | coming-soon | **Defer** |

For now **Channels stays Text + WhatsApp** (both built). Campaigner Email + Calls fold into this group *later* when built — they are not P1. (P1 email = transactional infra, not a Channels nav item.)

### Actions (public-facing) — new area
| Action | uprise | prog | Verdict |
|---|---|---|---|
| Forms & Petitions | none | coming-soon | **Build** (all tiers) |
| Surveys (public) | engagement survey (canvass/text) exists | coming-soon | **Build** public variant; reconcile with engagement survey (Growth+) |
| Fundraisers | none | coming-soon | **Build** (Growth+; ties to Commerce) |

### Organising — promote
| Item | uprise | prog | Verdict |
|---|---|---|---|
| Events | stub (`/prog/events`) | real (calendar, attendees) | **Promote/Build** |
| Calendar | stub (`/prog/calendar`) | FullCalendar | **Promote/Build** |
| Ladders | none | engagement ladders | **Build** (Growth+) |

### Audience — keep + extend (sensitive)
| Item | uprise | prog | Verdict |
|---|---|---|---|
| Lists / CSV / sync | built (`/audience`) | Persons/Audience | **Keep** uprise |
| Segments | limit dimension exists but **no create endpoint** (limit is display-only) | real segment CRUD (dynamic/static) | **Build native** — also makes the `segments` plan limit enforceable |
| Tags | none | real | **Build** (Starter+) |
| Queries / Reports / Activists | none | real | **Defer** (fold into Segments/Analytics later) |

⚠ **Constraint:** keep all existing uprise audience functionality and do **not** port/remove the existing segment work. Build segments *natively* to fit the uprise audience model and the existing limit dimension; do not lift prog's implementation wholesale.

### Settings / Workspace — consolidate
| Item | uprise today | prog | Verdict |
|---|---|---|---|
| Team | `/settings/team` (built) | `/admin/team` (RBAC) | **Merge** into uprise Team |
| Integrations | `/settings/integrations` | Syncs/Webhooks (Dev Hub) | **Merge** prog connectors here |
| Org profile / Branding | partial (`/prog/tenant-settings` stub) | real | **Build** into Settings → General/Branding |
| Billing | none | Stripe billing | **Build** (owner-only) |
| Activity / Audit log | `audit.log` exists in CASL; no UI | real | **Build** Settings → Activity (Growth+) |
| Security (org 2FA/SSO) | `/account` has personal 2FA | real (SSO, rate limits) | **Build** org Security (SSO = Scale) |
| Tenants | `/prog/tenants` stub | real | **Keep in Super Admin** (multi-tenant = super-admin) |
| Plans / Feature flags | built (Super Admin group) | `/admin/plans` | **Keep** uprise (already done) |

### Commerce / Business — in scope (higher tiers)
| Item | uprise | prog | Verdict |
|---|---|---|---|
| Payments / Transactions | stub | real | **Build** (Growth+, owner) |
| Invoices | stub | real | **Build** (Growth+, owner) |
| Products | stub | real | **Build** (Growth+; ties to Fundraisers) |
| Support tickets | stub | real | **Build** (Growth+) or Defer |
| Checkout | stub | — | **Build** with Fundraisers/Products |

### Developer Hub — in scope (top tier)
| Item | uprise | prog | Verdict |
|---|---|---|---|
| API Keys | stub | real | **Build** (Scale; owner/super-admin) |
| Webhooks / Syncs | stub | real | **Merge** into Settings → Integrations (Growth+) |
| Shortlinks | none | real link tracking | **Build** (Starter+) |
| Wrappers / Snippets / Form elements | stub | real | **Build** as supporting infra for Email/Forms (no separate tier) |
| AI Assistant | `FEATURE_AI_ASSIST_ENABLED` exists | config page | **Merge** into Settings (Growth+); no separate page |
| File Manager | stub | real | **Build** (Starter+; assets for Email/Forms) |
| Custom fields / Keywords / Datasets | none | real | **Build** as personalisation infra (Growth+) |

### Out of scope — drop from this round
Grant Management suite (applications/reviewing/funds/allocations/payments/contracts), Support/KB/Trainings/Release-notes, Tasks (List/Kanban). **Drop** the corresponding `/prog/*` stubs or leave parked in the sandbox until a later round.

---

## Part B — Merge map (the consolidations)

- **Channels (P1):** keep **Text + WhatsApp** (built). Campaigner **Email** + **Calls** fold in *later* when built — deferred, not P1. P1 email is **transactional only** (backend infra), not a Channels nav item. Retire `prog/Channels` once Email/Calls graduate.
- **Settings:** prog Workspace items → uprise **Settings** (Team merge, Billing, Branding, Activity, Security) and **Super Admin** (Tenants, Plans, Flags — already there).
- **Integrations:** prog **Syncs/Webhooks** + Dev Hub connectors → uprise **Settings → Integrations**.
- **AI Assistant:** no standalone page — drive off the existing `FEATURE_AI_ASSIST_ENABLED`, surface config in Settings.
- **Audience:** keep uprise; **build Segments natively** (also enables the `segments` limit) + **Tags**.
- **Retire the Prog group:** as each feature graduates into a real section, remove it from the super-admin Prog tree. Anything left (out-of-scope stubs) stays sandboxed.

---

## Part C — Plan placement (feature → flag → tier)

New flags follow the existing pattern: nav items via `NAV_FLAGS` (`packages/flags/src/nav.ts`, plan-driven, **default ON so plans restrict**); capability gates via `CORE_FLAGS` (`packages/flags/src/index.ts`). Entitlement lives in each plan's `featureFlags` JSON; tiers below mean "ON at this tier and above".

| Feature | Flag (new unless noted) | Grassroots | Starter | Growth | Scale |
|---|---|---|---|---|---|
| Email channel (campaigner) 🔜 | `FEATURE_NAV_CHANNELS_EMAIL` | 🔜 | 🔜 | 🔜 | 🔜 |
| Text/SMS channel | `FEATURE_NAV_CHANNELS_TEXT` (exists — re-tier) | – | – | ✓ | ✓ |
| WhatsApp | `FEATURE_WHATSAPP_ENABLED` (exists) | – | ✓ | ✓ | ✓ |
| Calls channel 🔜 | `FEATURE_NAV_CHANNELS_CALLS` | – | – | – | 🔜 |
| Forms & Petitions 🔜 | `FEATURE_NAV_ACTIONS` + `FEATURE_ACTIONS_FORMS` | 🔜 | 🔜 | 🔜 | 🔜 |
| Surveys (public) 🔜 | `FEATURE_ACTIONS_SURVEYS` | – | – | 🔜 | 🔜 |
| Fundraisers 🔜 | `FEATURE_ACTIONS_FUNDRAISERS` | – | – | 🔜 | 🔜 |
| Events + Calendar | `FEATURE_NAV_ORGANISING` (rename of `_PROG_ORGANISING`) | – | ✓ | ✓ | ✓ |
| Ladders | `FEATURE_ORGANISING_LADDERS` | – | – | ✓ | ✓ |
| Audience segments | `FEATURE_AUDIENCE_SEGMENTS` (count-limited per plan) | ✓(2) | ✓(5) | ✓(20) | ✓(∞) |
| Audience tags | `FEATURE_AUDIENCE_TAGS` | – | ✓ | ✓ | ✓ |
| Advanced analytics 🔜 | `FEATURE_ADVANCED_ANALYTICS` | – | – | 🔜 | 🔜 |
| Shortlinks | `FEATURE_SHORTLINKS` | – | ✓ | ✓ | ✓ |
| File manager | `FEATURE_FILES` | – | ✓ | ✓ | ✓ |
| Activity / audit log | `FEATURE_AUDIT_LOG` | – | – | ✓ | ✓ |
| Commerce (payments/invoices/products) | `FEATURE_NAV_BUSINESS` + `FEATURE_PAYMENTS` | – | – | ✓ | ✓ |
| Support tickets | `FEATURE_SUPPORT_TICKETS` | – | – | ✓ | ✓ |
| Webhooks / syncs | `FEATURE_WEBHOOKS` | – | – | ✓ | ✓ |
| API access (Dev Hub) | `FEATURE_API_ACCESS` + `FEATURE_NAV_DEVHUB` | – | – | – | ✓ |
| SSO | `FEATURE_SSO` | – | – | – | ✓ |
| Custom branding / white-label | `FEATURE_BRANDING_CUSTOM` | – | – | – | ✓ |

**Legend:** ✓ = entitled & live at this tier and above. 🔜 = sold but not built — render as **Coming soon** (visually differentiated) on `/plans` until shipped, never as a plain tick.

**Not plan-gated (every tier):** Billing, Team, Org profile, personal Security/2FA, Dashboard, Inbox, Compliance, basic Analytics — these are role-gated only (below). Billing must be reachable on every plan so customers can manage/upgrade. **Transactional email** (system mail) is platform infra, not a plan feature.

---

## Part D — Role / user-type privilege placement

Roles rank **super-admin > OWNER > ORGANISER > VOLUNTEER** (`ROLE_RANK` in `apps/api/src/auth/roles.guard.ts`; `User.isSuperAdmin` is god-mode). Volunteers stay bounced to `/field`. "Min role" = this role and above; super-admin bypasses all.

| Feature area | Min role | CASL resource (existing or new) |
|---|---|---|
| Channels (Email/SMS/WhatsApp send) | ORGANISER | `messaging.all` (exists) |
| Calls | ORGANISER (use) / OWNER (provider config) | `telephony.all` (exists) |
| Actions (forms/petitions/surveys/fundraisers) | ORGANISER (create) / OWNER (fundraiser payout) | **`actions.all`** (new) + `payment.all` for payouts |
| Events / Calendar / Ladders | ORGANISER | **`organising.all`** (new) |
| Audience + Segments + Tags | ORGANISER | `audience.all` (exists) |
| Journeys / Compliance / Analytics | ORGANISER | exist (`journey.all`, `compliance.all`, `analytics.all`) |
| Advanced analytics | ORGANISER (read) | `analytics.all` (exists) |
| Team — view | ORGANISER | `tenant.member` (exists) |
| Team — change roles / remove | OWNER | `tenant.member` + last-owner guard (exists) |
| Billing / Plan assignment | OWNER | `payment.all` (exists) |
| Org profile / Branding | OWNER | `tenant.org-profile` (exists) |
| Activity / Audit log | OWNER | `audit.log` (exists, read) |
| Security (org 2FA, SSO) | OWNER | **`tenant.security`** (new) |
| Commerce (payments/invoices/products/support) | OWNER (finance) / ORGANISER (products) | `payment.all` + **`commerce.all`** (new) |
| Webhooks / Syncs / Integrations | ORGANISER (manage) / OWNER (secrets) | `integration.all` (exists) |
| API keys (Dev Hub) | OWNER | **`devhub.apikey`** (new) |
| Tenants | super-admin | `tenant.all` / god-mode |
| Feature flags (global) / Plans CRUD | super-admin | `system.feature-flags-global` (exists) |

**New CASL resources to introduce** (in `packages/permissions/src/roles.ts`, mirroring the existing `*.all` grants): `actions.all`, `organising.all`, `commerce.all`, `tenant.security`, `devhub.apikey`. Grant `actions.all`/`organising.all`/`commerce.all` (products) to `organiser`+`owner`; `tenant.security`+`devhub.apikey`+`commerce` finance to `owner` only.

---

## Part E — Concrete additions catalogue (for the build round that follows)

When this strategy is approved and implementation begins, the additive pieces are:

- **Flags:** add the ~18 new keys from Part C to `CORE_FLAGS` / `NAV_FLAGS`, all PLAN_DRIVEN, default ON; re-tier `FEATURE_NAV_CHANNELS_TEXT`.
- **Plan seed:** set the per-tier `featureFlags` in `plans.seed.ts` to the Part C matrix; wire the `segments` limit to the new segments-create endpoint (closes the display-only gap noted in the prior limits work).
- **Permissions:** add the 5 new CASL resources (Part D) + `@RequirePermission` on every new endpoint.
- **Nav:** extend `buildNav` (`apps/admin/src/app/(main)/layout.tsx`) — Email/Calls into Channels, new Actions/Organising/Business/Dev Hub groups; remove graduated items from the Prog group.
- **Admin plans editor** already supports per-plan `featureFlags` toggles + limits (shipped) — new flags appear automatically once registered.

---

## Part F — Recommended priority (not a build commitment)

1. **P1 — honesty + the cheap real wins:** badge the sold-but-unbuilt rows (campaigner Email, Calling, Forms/Petitions, Surveys/Fundraisers, Advanced analytics) as **Coming soon** on `/plans`, visually differentiated; ship **transactional email only**; re-tier Text/SMS to match pricing; build **native Segments + enforce the limit** (the one sold item that's cheap to make real). No campaigner-channel builds in P1.
2. **P2 — turn "coming soon" into shipped:** campaigner **Email**, **Forms/Petitions**, **Advanced analytics**, Fundraisers + Commerce/payments, Events/Calendar, Billing, Activity/audit, Tags, Shortlinks, File manager.
3. **P3 — top-tier & dev:** Calls, API keys/Dev Hub, Webhooks/Syncs merge, SSO/Security, custom branding, Ladders.
4. **Parked:** Chats/Social/Direct mail, Support tickets, Grant Management, Support/KB, Tasks.

---

## Risks / constraints

- **Segments:** build segments to the uprise audience model; do not lift prog's. Coordinate so the new segments-create path also satisfies the existing (display-only) `segments` plan limit.
- **Pricing↔entitlement drift:** `/plans` today shows unbuilt capabilities (campaigner Email, Calling, Forms, Surveys/Fundraisers, Advanced analytics) as plain ticks, and Text/SMS is live for all tiers despite a Growth+ promise. Resolve by badging unbuilt rows **Coming soon** (visually differentiated) and re-tiering Text; keep `plans.seed.ts` featureFlags and the pricing copy in lock-step.
- **Email scope confusion:** keep transactional email (system mail, exists, P1) firmly separate from the campaigner Email channel (broadcasts/threads, not built, P2). Don't let "Email" on the pricing page read as the campaigner channel before it ships.
- **prog stubs are UI-only:** every "Promote/Build" item needs a real NestJS domain (schema + outbox + FSM where stateful) — the `/prog/*` page is a starting visual, not working code.
- **Backend-first invariants still apply** to the build round: additive migrations via `prisma migrate deploy`, outbox-atomic writes, `@RequirePermission` on new endpoints, the DI boot smoke as the gate.

## How to use / verify this doc

- Cross-check the Part C matrix against marketing `/plans` (must agree row-for-row before shipping any tier change).
- For each kept/ported feature, confirm the intended gate resolves: super-admin sees all via `/settings/flags`; a tenant on each plan sees exactly the Part C set (the flag resolver precedence is env→tenant→network→plan→global→default).
- Confirm role gates against the CASL matrix (`packages/permissions/src/roles.ts`) and the rank-aware `RolesGuard`.
