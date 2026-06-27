# Handoff: Uprise Canvassing (door-knocking + P2P texting, unified)

## Overview
Uprise is a P2P SMS campaigning tool (build an audience → blast a templated message → work
the replies in a shared inbox). This design adds a **best-in-class canvassing layer** and a
**shared contact spine** so that door knocks and texts live on one timeline. It spans two
surfaces — a **mobile PWA for canvassers** (offline-first, one-handed) and a **desktop
organiser app** — plus a shared engagement library and a cross-channel journeys engine.

The interactive prototype is a single Design Component: **`Uprise Canvassing.dc.html`**.
A dark "prototype" strip at the top of the file switches between all 16 surfaces; in-app
navigation (sidebar, in-flow buttons) also works.

## About the design files
The file in this bundle is a **design reference created in HTML/JS** (a streaming Design
Component). It demonstrates intended **look, layout, copy and behaviour** — it is **not
production code to copy directly**. The task is to **recreate these designs in the Uprise
codebase's existing environment** (Next.js 14 App Router, React client components, Radix
primitives + Tailwind, class-variance-authority, the `cn()` helper, the hand-built
`components/ui/` primitives, and the existing Material-3-flavoured CSS-variable tokens),
using its established patterns — not to ship the HTML.

> The prototype intentionally uses inline styles and a small internal state machine so it can
> stream live. In the real app, map each screen onto the existing route group `(main)` /
> `layout.tsx`, the `request<T>()` fetch wrapper, and the existing `Button`/`Card`/`Input`/
> `StatusBadge`/`EmptyState`/`Toast`/`PaginationControls` primitives.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, component shapes, copy and the core
interactions are all intended as-built. Recreate pixel-faithfully using the codebase's
existing libraries. The only deliberately faked parts are: map canvases (drawn as inline SVG
placeholders — real app uses the existing Mapbox `TurfMap` component), and sample data.

---

## Design tokens (exact values used)

### Colour
| Role | Hex |
|---|---|
| Primary (royal blue) | `#2f5bd6` |
| Primary hover / active | `#2749b8` |
| Primary soft surface (selected bg) | `#eef2fd` |
| Primary soft border | `#d4def9` (also `#c7d4f5`) |
| Ink (headings) | `#16181d` |
| Ink-2 (body) | `#3a3f4a` |
| Muted text | `#6b7280` |
| Faint / meta text | `#8b909c` |
| Border default | `#e6e8ec` |
| Border subtle | `#eef0f3` |
| Hairline (table rows) | `#f3f4f6` |
| App background | `#f5f6f8` |
| Card surface | `#ffffff` |
| Success | `#16a34a` on `#e7f6ec` |
| Warning | `#b45309` / `#92600e` on `#fef3e2` / `#fffaf0` |
| Danger | `#dc2626` on `#fdeaea` |
| Knock / door accent (purple) | `#7c3aed` on `#f3eafe` |

### Support-level scale (campaign-defined)
Strong support `#16a34a` · Lean support `#0e9488` · Undecided `#94a3b8`/`#6b7280` ·
Lean oppose `#b45309` · Strong oppose `#dc2626`. Rendered as a left-to-right stacked bar
and as pill/dot chips.

### Typography
- **UI / body:** Open Sans (weights 300–800). Headings use 700–800.
- **Logo wordmark only:** Quicksand 700 (the "Uprise" lockup). Do **not** use Quicksand for UI.
- **Numerals:** `font-variant-numeric: tabular-nums` on anything counted (doors, %, IDs, times).
- **Scale (px):** 11, 12, 12.5, 13.5, 14, 15, 16, 18, 20, 24, 28, 30. Page titles 28–30/800;
  section headings 14–18/800; body 13.5–15.
- Uppercase micro-labels: 11px/700, `letter-spacing:.04–.05em`, `text-transform:uppercase`,
  colour `#6b7280` (or accent for emphasis).

### Radius
Buttons 9–13px · inputs/fields 11–12px · cards 14–16px · pills/badges `999px` ·
phone bezel 46px (outer) / 36px (screen).

### Shadow
- Card: `0 1px 2px rgba(16,24,40,.04)`
- Elevated (toolbars, popovers): `0 4px 14px rgba(16,24,40,.10)`
- Floating card on map / next-stop: `0 8px 28px rgba(16,24,40,.18)`
- Modal/device: `0 34px 80px rgba(16,24,40,.34)`
- Primary button: `0 1px 2px rgba(16,24,40,.18)`

### Spacing & layout
4px base. Desktop container max-width 1080–1180px, page padding 30–32px. Sidebar 230px,
header 66px. Cards padded 18–24px. Mobile phone canvas designed at 392×812 (scales to fit
viewport).

### Motion
`fadeUp` (translateY 9→0, .28s ease) on screen entry · `popIn` (translateY 6→0, .2s) on door
pad/survey · progress bars transition width .3–.4s · `livePulse` (2s box-shadow ring) on live
dots · toast slides up .25s. Snappy ease-out, no bounce. Context/section colour swaps slower.

### Icons
Lucide (1.8px stroke; sizes 13/14/15/16/18px matched to adjacent text cap-height). No emoji.

---

## Information architecture (all 16 surfaces)

```
A. Canvasser PWA  /field            (mobile, sidebar-less, offline-first)
   A1 Assignments           /field
   A2 Walk view (List⇄Map)  /field/[turfId]
   A3 Door entry            /field/[turfId]/door/[stopId]   (DispositionPad → SurveyRunner)
   A4 Sync centre / profile /field/me

B. Organiser  /canvass              (desktop shell: sidebar + header + main)
   B1 Canvass overview      /canvass
   B2 Turf-cutting map      /canvass/[c]/turf
   B3 Walk-list builder     /canvass/[c]/walklists
   B4 Live war-room         /canvass/[c]/live
   B5 Canvasser management  /canvass/canvassers
   B6 Results & reporting   /canvass/[c]/results

C. Shared engagement library  /engagement
   C1 Scripts               /engagement/scripts
   C2 Surveys & questions   /engagement/surveys      (dual-channel author — the killer)
   C3 Dispositions          /engagement/dispositions
   C4 Canned responses      /engagement/canned-responses

D. Journeys (automation)     /journeys

E. Spine
   E1 Contact profile        /contacts/[id]          (unified door+text timeline)
   E2 Inbox (coupled)        /inbox
```

---

## Screens / views

### Shell (desktop)
- **Sidebar** 230px, white, `1px #e6e8ec` right border. Logo lockup (Quicksand 700, blue knot
  mark). Nav items: Dashboard · Audience · Inbox · Canvass · Engagement · Settings — 11px/12px
  padding, radius 11px; **active = solid `#2f5bd6`, white text**; idle = `#3a3f4a` on
  transparent. Bottom: Tour (ghost) + Log out (bordered). Role-aware: canvassers skip this and
  land in `/field`.
- **Header** 66px, white, bottom border. Left: breadcrumb (`#6b7280`, last crumb `#16181d`/700).
  Right: primary **Create blast** button (`#2f5bd6`, white, radius 10, `c` shortcut).

### Shell (mobile PWA)
Device frame, no sidebar. **Status bar** (9:41 + signal/wifi/battery). **Sticky offline banner**
(`#fef3e2`/`#92600e`, "Offline — everything you log is saved on this phone") with a **sync badge**
(`N to sync`). Both are cross-cutting (present on every field screen).

### A1 · Assignments (`/field`)
- **Purpose:** canvasser's home — pick a turf and start walking.
- **Layout:** greeting + avatar button (→ sync centre); 3 stat tiles (doors today / conversations
  / surveys); stacked turf cards.
- **Turf card:** 96px map thumbnail (SVG polygon on grid) with a **sync chip** (Synced ✓ green /
  Download — grey); name; "`{doors}` doors · `{walklist}` on your walk list"; primary
  **Start walking** (`#2f5bd6`, radius 13) + a download-for-offline icon button.

### A2 · Walk view (`/field/[turfId]`)
- **Purpose:** work the route. **List is the low-power default; Map is a download-required enhancement.**
- **Header:** back button, turf name, "`{n}` of `{m}` stops done", **List⇄Map segmented toggle**,
  and a green **progress bar**.
- **List mode:** "Route-optimised · shortest path" label; ordered `WalkStopCard`s — order number
  chip, resident name, address, **status badge** (Pending/Visited/Skipped), a **prior-contact
  glyph + one-line summary** when known. The **next stop is highlighted** (blue border + shadow)
  with a full-width **"Knock — next stop"** button; other pending stops get a quieter "Knock here".
  Visited/skipped rows dim to 66% opacity.
- **Map mode:** turf boundary (dashed), optimised route path, status-coloured pins (tap → door),
  the canvasser's live position (pulsing blue dot), and a floating **next-stop card** ("40m away"
  + Knock). [v1+: turn-by-turn directions.]

### A3 · Door entry (`/field/[turfId]/door/[stopId]`) — the core moment
- **Purpose:** capture the conversation in the fewest taps.
- **Header:** resident name + address + a support-level chip.
- **Prior-contact strip** ("Walk up informed · recent contact"): up to ~3 recent events
  (inbound/outbound text, prior knock) each with a channel icon, text and timestamp. **This is
  the user's #1 priority — the informed knock.**
- **DispositionPad:** big **"Spoke to someone"** (`#16a34a`, full width) → reveals the
  SurveyRunner. Grid of no-contact outcomes: **Not home**, **Come back later**, **Refused**.
  A separated, warning-styled row for terminal/data-quality codes: **Moved**, **Wrong address**.
  Footer: "GPS captured automatically · one tap logs & advances."
- **One-tap behaviour:** tapping any no-contact/terminal outcome logs the disposition (status →
  Visited/Skipped), increments the sync count, shows a toast ("Logged: … · saved offline") and
  **auto-returns to the walk list at the next pending stop**.
- **SurveyRunner:** one question per screen, big targets, fully offline. Progress bar +
  "Question N of M". Each option shows its label and the **dual-channel mapping** (door label /
  SMS reply preview). Selecting advances; last answer logs the conversation + survey and returns
  to the walk. Back + "Skip question" controls.
- [v1+ noted in spec: notes field, photo of a sign/flyer, "add household member" in one tap,
  "not safe / do not return" flag.]

### A4 · Sync centre / profile (`/field/me`)
Today's tally tiles; a list of **unsynced records** (icon by type, address, cloud-off glyph) with
a pending count and **Sync now**; **Release turf when done** (danger-outline).

### B1 · Canvass overview (`/canvass`)
Title + campaign switcher + **Cut new turf**. Four headline KPIs (Doors today / Turf complete /
Contact rate / Canvassers out) with deltas. Grid of **turf cards**: map thumbnail, doors badge,
status chip (Unassigned/In progress/Complete), walk-list + knocked counts, **completion progress
bar**, assignee avatar, **Manage →** (→ walk-lists).

### B2 · Turf-cutting map (`/canvass/[c]/turf`)
Full map canvas with drawn/dashed turf polygons + contact-density dots; a floating draw/split/add
toolbar; legend. Right rail: **Universe selector** (3 radio-cards: existing contacts only /
addresses without contacts / **hybrid – recommended**), and a list of drawn turfs with colour
swatches + door counts. Actions: **Even split by doors**, **Save & re-bucket** (re-geocode +
point-in-polygon reassign).

### B3 · Walk-list builder (`/canvass/[c]/walklists`)
Left: optimised ordered stop list ("Optimised · 32 stops · 2.1 km", **Re-optimise**). Right:
**Assignment** card showing the current holder with a **server-held lock** ("Locked — held since
…", explains double-assignment prevention) + Reassign; **List type** segmented (Static / Dynamic)
with a "Dynamic — auto-refreshes" note.

### B4 · Live war-room (`/canvass/[c]/live`)
"Live · 12 canvassers out" pulse chip. Four live KPIs. Map with pulsing canvasser positions +
turf overlays. **Alerts** panel (idle canvasser / turf complete / hostile-contact flag, colour-
toned). **Canvasser table:** avatar+name, turf, doors (tabular), last action, active/idle status
chip. Real-time via the existing `/analytics/stream` SSE bus.

### B5 · Canvasser management (`/canvass/canvassers`)
**Invite canvasser** action. Table: avatar+name, **role chip** (Canvasser blue / Organiser
purple), assignment, doors, surveys, status dot+label. This is where a field login is issued
(AppUser role + scrypt auth already built).

### B6 · Results & reporting (`/canvass/[c]/results`)
**Export CSV** + **Sync to VAN**. Cards: **Disposition breakdown** (labelled progress bars);
**Support level** (stacked bar + legend %); **Door + text funnel** (Doors attempted → Contacted →
Surveyed → New supporters, value-in-bar); **VAN reconciliation** ("Synced 4 min ago", we
recorded X / VAN shows Y / N to reconcile, Review differences).

### C1 · Scripts (`/engagement/scripts`)
Opening line card (blue) + outcome-keyed branches (If interested → / If unsure → / If not
interested →) on an indented tree, with **Add branch**. One script drives a door workflow and a
text journey.

### C2 · Surveys & questions (`/engagement/surveys`) — the killer interaction
Two-pane: **left = editor** (question text + an options table where each row carries a **Door
label**, an **SMS reply**, and a **mapped disposition** chip — one object); **right = live dual
preview** stacked: "At the door" (the door buttons) and "As a text reply" (chat bubbles +
"picking 'Very' → logs Strong support"). Editing a question changes **both** channels.

### C3 · Dispositions (`/engagement/dispositions`)
Two columns: **Contact results** (editable, colour swatch + label + desc + Add code) and
**Terminal / data quality** (locked system defaults with a lock glyph — keeps cross-org
benchmarking valid). Below: the campaign-defined **support-level scale** as pill chips.

### C4 · Canned responses (`/engagement/canned-responses`)
Three tiers as columns: **Recommended** (org), **Mine** (personal), **Auto-send** (warning-tinted,
"fires automatically on first reply"). Each item shows the message + the disposition it logs.
This library powers the inbox suggestions.

### D · Journeys (`/journeys`)
Left: journey list (name, enrolled count, conversion %, Live/Draft chip). Right: **visual builder**
— a vertical node flow (Trigger → Wait → Action → Condition → Action), each node a coloured
type chip + title + sub, connected by stubs, with **Add step** and a **Dry run**. Below: a
draggable **palette** of triggers/actions (Disposition set, Message received, Survey answer, Tag
added, Queue P2P text, Create door task, Wait, Hand to inbox). Models the spec's example:
*"Not home ×2 → wait 2 days → text; if reply interested → create a door task for nearest canvasser."*

### E1 · Contact profile (`/contacts/[id]`) — the differentiator
- **Header:** avatar, name, support-level chip, tags, address (+ mini-map pin), phone, audience
  count.
- **Next-action banner** (blue): the queued next step + **Send text** (→ inbox composer) and
  **Queue door task**.
- **Unified timeline** (centre): reverse-chronological, **door knocks + texts + journey events
  interleaved, never split by campaign**. Knock cards tinted purple, journey events amber, texts
  white. Knock cards show disposition, GPS/address and canvasser; meta row for extra detail.
  **Unified / Doors / Texts** filter toggle.
- **Right rail:** latest survey answers (coloured), disposition history (dot + date), audience
  memberships (pills).

### E2 · Inbox (coupled) (`/inbox`)
Three-pane within the desktop shell. Left: filter pills (all/unresolved/awaiting/responded/
priority) + conversation list (support dot, name/number, snippet, time, selected = blue).
Right: thread header (avatar, **View contact** → profile, Mark resolved) + **thread that
interleaves door-knock events** (purple centre chips) with text bubbles (in = grey left, out =
blue right) + composer with **Suggested replies from the canned library** (each logs a
disposition) and Send.

---

## Interactions & behaviour
- **Navigation:** prototype top strip switches surfaces; sidebar + in-flow buttons mirror real
  routing. Device vs desktop shell is chosen by route group (`/field` = PWA, everything else =
  organiser shell).
- **Door logging:** one tap on a no-contact/terminal outcome → write structured record, capture
  GPS, queue offline, toast, auto-advance to next pending stop. "Spoke" → SurveyRunner.
- **SurveyRunner:** select option → advance; final option → log conversation+survey → return to
  walk. Back returns to pad on Q1; Skip advances.
- **Walk progress:** green bar = visited/total; next pending stop is computed and highlighted.
- **List⇄Map** and **timeline filter** and **universe/list-type** are segmented toggles.
- **Offline-first:** every field action writes locally and increments the sync badge; nothing
  blocks on the network. Banner reassures data is saved.
- **Server-owned truth:** turf assignment + conversation ownership + dispositions use server locks
  (no double-knock / double-assign). Surface lock state in walk-lists + inbox ownership.
- **Realtime:** live war-room + inbox unread badge over the existing SSE `/analytics/stream`.
- **Author once, use everywhere:** one survey option object renders to a door button **and** a
  canned SMS reply; editing changes both. Picking a canned reply always logs its disposition.
- **Motion:** see Design tokens → Motion.

## State management
Per the existing codebase: **inline `useState` only, no Redux/Zustand/react-query**; data via the
`request<T>()` wrapper returning `{ok,data}|{ok,error}`; lists refresh by polling; toasts on
success/error. Field app additionally needs: an **offline queue** (IndexedDB/service worker —
already built), **sync status** state (pending/syncing/synced/conflict), and **server lock**
state for turf/ownership. Key per-screen state in the prototype: current screen/route, active
turf, walk view (list/map), stops + statuses, current door stop + door stage (pad/survey),
survey step + answers, timeline filter, inbox selection + filter, turf universe, walk-list mode.

## Assets
- **Logo:** "Uprise" wordmark (Quicksand 700) + a three-loop knot mark in `#2f5bd6` (drawn as inline
  SVG in the prototype — replace with the real Uprise logo asset from the codebase).
- **Icons:** Lucide (inline SVG in the prototype; use `lucide-react` in the app).
- **Maps:** SVG placeholders — replace with the existing Mapbox `TurfMap` component (`view` mode
  for canvasser, `edit` mode for the turf-cutting tool).
- **Fonts:** Open Sans + Quicksand via Google Fonts.

## Files
- `Uprise Canvassing.dc.html` — the full interactive prototype (all 16 surfaces). Open it directly
  in a browser; use the top strip to navigate. The markup/logic inside is the reference for layout,
  copy, colours and behaviour.

---

## Gaps — interfaces still needed for a truly world-leading tool
These are **not** in the current prototype (which covers the spec's 16 surfaces). Highest-value
additions, grouped:

**Field (canvasser)**
1. **Canvasser login + first-run training** — role-aware field entry, a 60-second "how to knock"
   + safety primer, practice script.
2. **Create-contact-at-door / add household member** — for the "addresses without contacts"
   universe; one-tap add of an extra resident.
3. **Notes, photo capture & safety flag** — free-text note, photo of a sign/flyer, and a
   prominent **"not safe / do not return"** flag (spec'd as v1+).
4. **Offline conflict resolution detail** — when the server rejects a queued record, show the
   conflict and let the canvasser resolve it.
5. **End-of-shift summary** — wrap-up screen: today's totals, streak, "release turf".

**Organiser**
6. **Campaign setup wizard** — create a campaign, ingest the address/voter universe, set goals,
   define the support scale.
7. **Goals & pace-to-target dashboard** — doors/conversations targets vs actuals, pace, forecast.
8. **Shift scheduling & turf-by-time** — plan canvasser shifts, staging locations, check-in.
9. **Recruitment / volunteer pipeline** — invite → onboard → first-shift funnel.
10. **Data quality / QA review** — flag suspicious knocks (too-fast, GPS mismatch), spot-check
    canvasser records.
11. **IAM / roles & permissions detail** — scopes per role (organiser/canvasser/admin).

**Shared & cross-cutting**
12. **Consent & compliance centre** — opt-out ledger, suppression list, Spam Act / consent audit
    trail (critical for a texting + door tool).
13. **Integrations & settings** — Action Network / VAN / Twilio connection config + health.
14. **Notifications / broadcast to field** — push a message to canvassers currently out.
15. **State catalogue** — empty / loading / error states for every list and the offline edge cases.

(Phone-banking / call mode is optional — the timeline already references calls, so a call surface
would round out true omni-channel.)

---

## How to export this to Claude Code (prompt export / import)

This `design_handoff_uprise_canvassing/` folder **is** the export. Workflow:

1. **Download** the folder as a zip (a download card is provided in the chat).
2. **Unzip into your Uprise repo** (e.g. `docs/design_handoff_uprise_canvassing/`), or keep it
   alongside the repo.
3. **Open Claude Code** in the repo root and point it at this folder, e.g.:
   > "Read `design_handoff_uprise_canvassing/README.md` and open `Uprise Canvassing.dc.html` for
   > reference. Implement the **Door entry** screen (A3) as a new route in our Next.js app under
   > the `(main)` route group, using our existing `components/ui` primitives, Tailwind tokens and
   > the `request<T>()` wrapper. Match the colours, spacing and copy in the README exactly. Don't
   > copy the HTML — recreate it in our patterns."
4. **Implement screen-by-screen.** Give Claude Code one surface at a time (the IA list above is the
   build order) so each PR stays reviewable. Re-reference the README's token table and the relevant
   "Screens" section in each prompt.
5. For the maps, tell Claude Code to use the existing **Mapbox `TurfMap`** component rather than the
   SVG placeholders; for icons, **`lucide-react`**; for the logo, the real asset.

Tip: the README is written to be **self-sufficient** — a developer (or Claude Code) who wasn't in
this design conversation can implement every screen from it alone. Open the `.dc.html` only when you
want to see an interaction in motion.
