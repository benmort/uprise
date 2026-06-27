# Uprise Canvassing – Product UI/UX Definition

The complete interface surface for a world-leading door-knocking app, unified with
the P2P texting inbox around one persistent contact. Scope: every page and
interface, who it's for, and the interaction that makes it best-in-class.
Date: 2026-06-16.

---

## Uprise today – the existing product UI/UX (baseline)

What the app is before canvassing, so the additions sit in context. Uprise is a
P2P SMS campaigning tool: build an audience, blast a templated message, then work
the replies in a shared inbox. Next.js 14 App Router, all screens client-rendered.

### App shell & navigation
- A single authenticated **route group `(main)`** wrapped by one shared
  `layout.tsx`: a fixed **220px left sidebar** (logo, nav, tour button, logout)
  beside a flex content area.
- **Sidebar nav**: Dashboard · Audience · Inbox · Settings (Canvass now added).
  Active item is path-matched and highlighted.
- **Header** carries a primary *Create Blast* action (also the `c` keyboard
  shortcut); `Cmd+K` jumps to the Inbox.
- **Realtime**: a single `EventSource` SSE connection (`/analytics/stream`) with
  token refresh + exponential-backoff reconnect drives an unread badge on the
  Inbox nav item and audio "responder alerts" for new inbound texts.
- **Login** is a separate page; credentials are Basic-auth held in sessionStorage.
  A **PWA install prompt** and web manifest already ship.

### Design system
- **No external component library** – hand-built primitives on **Radix
  primitives + Tailwind**, variants via **class-variance-authority**, classes
  merged with a `cn()` helper.
- **Material-3-flavoured token palette** via CSS variables: `--primary`,
  `--surface`/`--surface-variant`, and `--{error,success,warning,secondary}`
  with matching `-container`/`-foreground` pairs. Consistent rounded, soft-shadow
  surfaces.
- **Reusable primitives** (`components/ui/`): `Button`, `Card`, `Input`,
  `StatusBadge` (icon+label, status→colour map), `EmptyState`, `ConfirmDialog`
  (hand-rolled modal), `Toast`/`useToast` (bottom-right stack), `PaginationControls`,
  `Skeleton`, `Breadcrumbs`, `TagChip` (draggable, for template tokens),
  `TooltipHint`.
- **State & data**: inline `useState` only – no Redux/Zustand, no react-query.
  Data flows through one `request<T>()` fetch wrapper in `lib/api.ts` returning
  `{ ok, data } | { ok, error }`; lists refresh by polling intervals. No form
  library – plain inputs + ad-hoc validation + toast on success/error.
- A **guided product tour** (spotlight + floating card, first-run + replayable)
  overlays the app for onboarding.

### The existing pages
- **Dashboard** (`/dashboard`) – recent blasts with search + pagination,
  auto-refreshing; the landing screen.
- **Audience** (`/audience`, `/audience/[id]`) – list/create audiences, **CSV
  upload** with live import progress, and **integration sync** (Action Network /
  internal source). Detail page lists contacts.
- **Blast composer** (`/blasts/[id]/composer`, `/composer`) – compose a templated
  SMS with draggable personalisation tags, live preview, a **proof send**, and
  schedule-or-send. Compliance checks on the body.
- **Blast detail** (`/blasts/[id]`) – per-blast KPIs, delivery/response trend,
  and a paginated activity log.
- **Inbox** (`/inbox`) – the heart of the app. Left: conversation list with
  filters (all/unresolved/awaiting/responded/priority), fuzzy search, SLA-age
  badges, pagination. Right: the message **thread** (inbound/outbound, merged with
  Twilio history and deduped), the **blast context** that triggered it, a reply
  composer with **AI/canned suggestions** (now powered by the shared library),
  and resolve/own controls. Responder-alert sounds + ownership were client-side
  localStorage (the canvassing work moves ownership server-side).
- **Analytics** (`/analytics`) – blast KPI dashboard with a live analytics stream.
- **Settings** (`/settings`) – feature flags, queue stats, responder-alert config.

### UX character today
Desktop-first, data-dense, operator-focused; fast inline interactions with
optimistic toasts; realtime where it matters (inbox); light onboarding via the
tour. Strong at "send and triage texts", with **no person entity, no field/mobile
surface, and no automation** – exactly the gaps the canvassing work fills.

---

## The bar (non-negotiable UX principles)

1. **One contact, one timeline.** Every screen that shows a person shows their
   full cross-channel history – door knocks, texts, calls, survey answers,
   dispositions – merged, never split by campaign. This is the wedge no
   competitor has.
2. **Offline is the default, not a mode.** The canvasser app works with the phone
   in airplane mode. List view never needs the network; the map is a
   download-required enhancement. Nothing blocks on a spinner at the door.
3. **One tap for the common case.** The most frequent door outcome ("not home")
   is a single tap that auto-advances. A full survey is 3–5 taps. Never 10 taps
   to log a household.
4. **The server owns the truth.** Turf assignment, conversation ownership and
   dispositions are server-held with real locks – two people can never double-knock
   or collide on the same contact.
5. **Author once, use everywhere.** A survey question is written once and renders
   as a door disposition button *and* a text canned reply. Editing it changes both.
6. **Every action logs data.** Picking a canned reply or tapping a disposition
   always writes a structured record. No silent drops.

## Two surfaces + a shared spine

- **Organiser** – desktop, data-dense, mouse-driven. Cutting turf, building lists,
  authoring scripts/surveys/journeys, watching the room live, reading results.
- **Canvasser** – mobile-first PWA, one-handed, offline, GPS, big tap targets.
  Get my turf → walk it → knock → record → next.
- **Shared spine** – the contact, the engagement library and the journeys engine
  feed both, and the existing inbox.

Legend below: **[built]** ships today · **[v1+]** specced, next to build.

---

## A. Canvasser app (mobile PWA) – `/field`

The differentiator. Sidebar-less, thumb-reachable, installable to the home screen.

### A1. My assignments – `/field` **[built]**
The canvasser's home. A card per assigned turf: name, door count, walk-list count,
a sync-status chip, and a **Download for offline** action (caches the turf snapshot
+ map tiles). One primary button: *Start walking*. Empty state when no turf is
assigned tells them to ask an organiser. Top bar carries the persistent
**offline banner** and **sync badge** (pending/syncing/synced/conflict counts).

### A2. Walk view – `/field/[turfId]` **[built]**
The working screen. A **List ⇄ Map** toggle (list is the low-power default):
- **List mode** – route-optimised, ordered stops. Each `WalkStopCard` shows order
  number, resident name, address, status badge (Pending/Visited/Skipped), and a
  *Knock* button. The next stop is highlighted.
- **Map mode** – clustered pins coloured by status, the canvasser's live position,
  the turf boundary, tap a pin to open the door. **[v1+: turn-by-turn walking
  directions to the next stop.]**

### A3. Door entry – `/field/[turfId]/door/[stopId]` **[built]**
Where the conversation is captured. Resident name + address up top, then the
**DispositionPad**: large outcome buttons (Spoke / Not home / Refused / Come back
later) plus a separated, warning-styled row for terminal codes (Moved / Wrong
address). One tap on a no-contact outcome captures GPS, queues the knock, and
returns to the list. "Spoke to someone" reveals the **SurveyRunner** – one question
per screen, big targets, fully offline. A **prior-contact strip** shows this
person's recent texts/knocks so the canvasser walks up informed. **[v1+: notes
field, photo of a sign/flyer, "add household member" in one tap, "not safe / do
not return" flag.]**

### A4. Canvasser profile / sync centre – `/field/me` **[v1+]**
Today's tally (doors, conversations, survey completions), a visible queue of
unsynced knocks with manual *Sync now*, conflict resolution if a record was
rejected, and *Release turf* when done.

---

## B. Organiser app (desktop) – `/canvass`

### B1. Canvass overview – `/canvass` **[built]**
Landing grid of turfs: name, contact + walk-list counts, assignment status
(assigned-to vs unassigned). Entry point to everything below. **[v1+: campaign
switcher, live "doors knocked today" and "% turf complete" headline metrics.]**

### B2. Turf cutting map – `/canvass/[campaignId]/turf` **[v1+]**
The heavy organiser tool. A full-screen Mapbox canvas to **draw, split and merge
turf polygons** (mapbox-gl-draw). Households auto-assign to a turf by
point-in-polygon. Three universe modes (Qomon's pattern): existing contacts only,
addresses without contacts (canvasser creates the contact in field), and a hybrid.
Shows contact density heat, suggested even splits by door count, and a save that
re-geocodes/re-buckets. The `TurfMap` component already supports an `edit` mode
seam for this.

### B3. Walk-list builder & assignment – `/canvass/[campaignId]/walklists` **[v1+]**
Build an ordered walk list from a turf (route-optimised server-side via Mapbox
Optimization, client TSP fallback for offline/large lists – both built). Assign a
list/turf to a canvasser; the **assignment lock** is enforced server-side (built),
so the UI shows who currently holds each turf and prevents double-assignment.
Static vs dynamic (auto-refreshing) lists, with a clear staleness indicator.

### B4. Live tracking dashboard – `/canvass/[campaignId]/live` **[v1+]**
The campaign manager's war room. Real-time (SSE, reusing the existing
`/analytics/stream`) map + table: canvasser positions, doors knocked, dispositions
streaming in, turf completion bars, alerts (canvasser idle, turf nearly done,
hostile-contact flag). Reuses the realtime event bus the journeys/engagement layer
already emits to.

### B5. Canvasser management – `/canvass/canvassers` **[v1+]**
Create/invite canvassers (the `AppUser` role + scrypt auth is built), set roles
(Organiser/Canvasser), see per-canvasser stats and current assignment. This is
where a canvasser account + password is issued for the field login.

### B6. Results & reporting – `/canvass/[campaignId]/results` **[v1+]**
Disposition breakdown, support-level distribution, survey cross-tabs, contact-rate
and conversion funnels, and the door+text combined view per contact. Export to
CSV and **two-way VAN / Action Network sync** with a reconciliation panel ("synced
at T; VAN shows X, we recorded Y").

---

## C. Shared engagement library (organiser/admin)

Authored once, consumed by door **and** text. Backend is built; these are the
authoring UIs **[v1+]** over it.

### C1. Scripts – `/engagement/scripts`
Build the interaction tree: an opening line plus outcome-keyed follow-up steps
(if they say X, read Y). One script attaches to a door workflow and a text journey.

### C2. Surveys & questions – `/engagement/surveys`
A reusable, typed question library (yes/no, single/multi-choice, scale, text).
The killer interaction: each answer option carries a **door button label**, an
**SMS canned-reply text**, and a **mapped disposition** – one object, rendered to
both channels. Authors see a live preview of both surfaces side by side.

### C3. Dispositions – `/engagement/dispositions`
The shared taxonomy: contact-result codes vs terminal/data-quality codes (the
latter locked as system defaults so cross-org benchmarking holds), plus a
campaign-defined support-level scale. Channel-aware (a door set vs a text set).

### C4. Canned responses – `/engagement/canned-responses`
Three-tier library: org "recommended", personal "mine", and auto-send. Using one
always logs its mapped disposition. This library now powers the inbox suggestions
(built) instead of hardcoded strings.

---

## D. Journeys (cross-channel automation) – `/journeys` **[v1+ UI; engine built]**

The clearest differentiator: door outcomes and texts as first-class triggers and
actions. A visual builder over the trigger → wait/condition → action engine that's
already running on the queue:
- **Triggers**: disposition set (door or text), message received, survey answer,
  tag added, no-answer-after-N.
- **Actions**: queue a P2P text, create a door-knock task, tag, wait, hand to a
  human inbox.
- Example a campaigner builds in five clicks: *"Not home ×2 → wait 2 days → queue
  a follow-up text; if they reply interested → create a door-knock task for the
  nearest canvasser."* Nobody else does door+text automation natively.
List view shows each journey's live enrolment count and conversion; the builder
has a dry-run/preview.

---

## E. The contact – the spine every surface links to

### E1. Contact profile / timeline – `/contacts/[id]` **[v1+ UI; spine built]**
The single source of truth. Header: name, address (with a mini-map pin), phone,
support level, tags, current "next action". Body: one reverse-chronological
**timeline** merging every door knock (with disposition + GPS + canvasser + survey
answers), every inbound/outbound text, and journey events. Right rail: survey
responses, disposition history, audience memberships. Actions: send a text (opens
the inbox composer), queue a door task, add to a journey, merge duplicate, flag
do-not-contact. This is where door and text finally become one record.

### E2. Inbox (existing, now coupled) – `/inbox` **[built + coupled]**
Already shipped; now a consumer of the shared library. Canned replies come from
`/engagement/canned-responses`; picking one logs a disposition; inbound texts fire
journey triggers; the thread will surface door-knock events from the same contact.

---

## F. Cross-cutting interface elements

- **Sync status badge** – everywhere in the field app; offline/pending/syncing/
  synced/conflict. **[built]**
- **Offline banner** – sticky when disconnected, reassures data is saved. **[built]**
- **Disposition pad / survey runner** – reused at the door and (read-only) on the
  contact timeline. **[built]**
- **Turf map** – one component, `view` (canvasser) and `edit` (organiser) modes.
  **[built – view; edit seam ready]**
- **Walk-mode toggle, walk-stop card** – the list-view primitives. **[built]**
- **Role-aware nav** – organisers see the full sidebar incl. Canvass; canvassers
  land directly in `/field` with no desktop chrome. **[built]**

---

## Build status at a glance

| Layer | State |
|---|---|
| Contact spine, shared engagement, journeys engine, canvassing domain, role auth | **Built + tested** |
| Canvasser app: assignments, walk view, door entry | **Built** |
| Organiser: canvass overview + nav | **Built** |
| Offline sync, route optimisation, geo, service worker, Mapbox view | **Built** |
| Turf-cutting editor, walk-list builder UI, live dashboard, canvasser mgmt, results/sync | **Specced (v1+)** |
| Engagement authoring UIs (scripts/surveys/dispositions/canned) | **Specced (v1+)** |
| Journeys visual builder, contact profile page | **Specced (v1+)** |

## What makes it world-leading (the summary)

1. **Unified door + text contact timeline** – the market gap.
2. **One shared script/survey driving both channels** – author once.
3. **Door-knock outcomes as journey triggers** – cross-channel automation nobody
   else has natively.
4. **Genuinely offline field app** with server-owned locks – no double-knocks, no
   lost data in low signal.
5. **A sane, shareable disposition taxonomy** – not BYO.
