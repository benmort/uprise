# Synthesis – canvassing + P2P texting product landscape

Cross-product analysis of the 11 dossiers in `products/`. Read those for the
cited detail; this file distils the patterns that matter for yarns' door-knocking
+ P2P inbox build. Date: 2026-06-16.

The four questions yarns cares about:
1. How door-knocking couples to a texting inbox.
2. Shared script / canned-response architecture across channels.
3. Shared survey model and where responses land.
4. Journey / sequence automation for contacts.

---

## 1. Capability matrix

Legend: ✅ native and strong · 🟡 partial / weak / via add-on · ❌ none ·
❔ unknown – not found.

| Product | Canvass UX | Turf / maps | Offline | Native P2P SMS | Shared inbox | Shared scripts (door+text) | Surveys | Journeys / automation | Disposition taxonomy | Shared contact spine |
|---|---|---|---|---|---|---|---|---|---|---|
| **NGP VAN / MiniVAN** | ✅ | ✅ | ✅ | ❌ (broadcast only) | ❌ | 🟡 (survey-driven, synced) | ✅ | 🟡 (manual ladders) | ✅ mature | ✅ (VANID) |
| **ThruText** | ❌ | ❌ | ❌ | ✅ | 🟡 (campaign-scoped) | 🟡 (via VAN sync) | ✅ (global, 4 types) | 🟡 (follow-up campaigns) | 🟡 (tags + VAN codes) | ❌ (campaign rows) |
| **Hustle** | ❌ | ❌ | ❌ | ✅ | 🟡 | 🟡 (via VAN survey) | 🟡 | 🟡 (keyword + reminders) | 🟡 (tags) | ❌ (defers to VAN) |
| **Impactive** | 🟡 (relational, no maps) | ❌ (punts to MiniVAN) | ❔ | ✅ | 🟡 | ✅ (one script model) | ✅ | 🟡 (keyword-branched) | 🟡 (org-defined tags) | ✅ (one contact row) |
| **Reach** | 🟡 (search-first, no lists) | ❌ | ✅ | ❌ (hands to native SMS) | ❌ | 🟡 (shared authoring, no inbox) | ✅ (6 types, reusable sets) | ❌ (manual action cards) | ❌ (faked as survey Qs) | ✅ (Person record) |
| **Spoke** | ❌ | ❌ | ❌ | ✅ | ✅ (dynamic assignment) | 🟡 (per-campaign, no library) | ✅ (interaction-step tree) | ❌ | 🟡 (tags + question responses) | ❌ (per-campaign rows) |
| **Action Network** | ❌ (→ Action Builder) | ❌ | ❌ | ❌ (broadcast only) | ❌ | 🟡 (canonical questions) | ✅ (canonical Q model) | ✅ (ladders of engagement) | 🟡 (flat tags) | ✅ (activist record) |
| **CallHub** | 🟡 (via Ecanvasser) | 🟡 (via Ecanvasser) | 🟡 | ✅ | ✅ (Pending/Chats) | 🟡 (per-channel) | ✅ | ✅ (Workflows engine) | 🟡 (per-channel codes) | 🟡 (tags as join) |
| **Qomon** | ✅ (strong) | ✅ (3 turf modes, routing) | 🟡 (list yes, map no) | ❌ (broadcast + share) | ❌ | 🟡 (survey reused, no canned) | ✅ (auto-launch at door) | 🟡 (Action Flows) | ✅ (4-button + support level) | ✅ (real-time unified) |
| **Ecanvasser** | ✅ (strong, offline) | ✅ (turf-cutting) | ✅ | ❌ (→ CallHub) | ❌ | 🟡 (survey, no cross-channel canned) | ✅ (drag-drop, 5 types) | ❌ | ✅ (customisable, sane defaults) | 🟡 (no household object) |
| **OutreachCircle** | 🟡 (no turf/routes) | 🟡 | 🟡 | ✅ | 🟡 | ✅ (one survey+script, pick channel) | ✅ | 🟡 (tag ladders + reminders) | 🟡 (named code sets) | ✅ (shared contact list) |

### What the matrix says

- **Nobody owns the whole stack well.** The market splits into canvassing-first
  (VAN, Qomon, Ecanvasser) and texting-first (ThruText, Hustle, Spoke,
  CallHub), with relational platforms (Impactive, Reach, OutreachCircle)
  straddling. The door↔inbox coupling yarns wants is a real gap.
- **Where coupling exists today it is a data sync, not a unified inbox.** VAN is
  the integration hub: ThruText/Hustle write text outcomes back to the VANID;
  MiniVAN writes door outcomes to the same record. There is no product where a
  door knock and an SMS thread are two views of one live conversation.
- **The strongest single-platform couplers are Impactive and OutreachCircle** –
  one contact, one script/survey, pick the channel – but both are shallow on
  field ops (no turf/maps/routing) and weak on true automation.
- **CallHub and Action Network have the only real automation engines** (Workflows
  / ladders of engagement). Both join channels via **tags**.

---

## 2. Door ↔ inbox coupling – the patterns

Four distinct coupling mechanisms appear across the products. They are not
exclusive; yarns should do all four.

1. **Shared contact spine.** One person record carries every touch – door, text,
   call, email – on a single timeline with a shared "last reached" clock.
   Done well by Impactive, Reach, Qomon, OutreachCircle. Done badly (per-campaign
   rows, no global person) by ThruText and Spoke – both dossiers call this their
   biggest structural mistake. **Lesson: build a persistent Contact entity from
   day one; never key conversations only to a campaign.**

2. **Outcome → cross-channel state.** A text reply or a door answer writes a
   disposition that is visible and actionable in the other channel. ThruText's
   neat version: a text writes "Texted", which upgrades to "Canvassed" once a
   synced survey question is answered. **Lesson: dispositions must be
   channel-aware but stored on the shared contact, not the channel row.**

3. **Auto follow-up on outcome.** An outcome triggers the next touch – e.g.
   "not home" → queue a follow-up text. Only CallHub Workflows and AN ladders do
   this as real automation; everyone else is manual. **Lesson: this is yarns'
   journeys engine, and it is a differentiator.**

4. **Two-way handoff.** A door knock can flag a contact for texting and vice
   versa. No product does this cleanly today (closest: OutreachCircle's
   pick-the-channel-per-contact). **Lesson: model a "next action" / hand-off on
   the contact so a texter can route a contact to a canvasser and back.**

The cautionary tale is **Reach**: it logs a "text" action but hands off to the
phone's native SMS app, so replies are never captured – there is no inbox. A P2P
product must capture the conversation in-platform.

---

## 3. Shared script / canned-response architecture

The convergent winning pattern, stated most clearly by Impactive, Spoke,
Action Network and ThruText:

- **One canonical question/survey object, authored once, bound to one custom
  field, edit-once-propagates-everywhere** (Action Network, VAN). The response
  options on that question become the **canned answers / disposition buttons** in
  every channel that uses it (VAN across MiniVAN + phone banks; Hustle's trick of
  auto-generating reply slots from VAN survey answers).
- **Two-layer script model** (Impactive): an *initial* script plus
  *outcome-keyed response scripts* – i.e. canned replies selected by the
  contact's answer. Spoke fuses this into a single self-referential
  **interaction-step tree** where picking the answer that matches a reply both
  advances the script and logs the structured response in one gesture.
- **Three-tier canned-response visibility** (ThruText, Hustle): admin-curated
  "Recommended/Saved Replies", personal "My Replies", and auto-send. Worth
  copying directly.

**The gap every product leaves:** canned responses are usually fragmented per
channel (CallHub) or per campaign (Spoke), and several (Spoke) let a canned
reply send *without* logging a disposition – silently dropping data. yarns
should make **one shared script/survey/canned-response library** that:
- drives door disposition buttons AND text canned replies from the same object;
- always captures a disposition when a canned response is used;
- is reusable across campaigns, not campaign-scoped.

---

## 4. Shared survey model

- Survey questions are first-class, reusable, typed (Reach: 6 types; Ecanvasser:
  5; ThruText: 4) and grouped into reusable **Question Sets** (Reach).
- At the door, the survey **auto-launches** after the disposition is set (Qomon)
  and is filled inline; in texting, the same question's options appear as canned
  replies and the reply is parsed into the response.
- Responses sync to the contact and out to the voter file / CRM (VAN survey
  responses, OSDI / Action Network). Spoke's action-handler pattern (a chosen
  answer fires a handler that syncs to VAN / Action Network) is the clean
  mechanism.

**Lesson for yarns:** model `Survey` → `Question` (typed) → `QuestionOption`,
with a `QuestionResponse` stored against the shared contact and tagged with the
channel + campaign it came from. The same `Survey` is attachable to a door
workflow and a text journey.

---

## 5. Journey / sequence automation

Two reference engines, both worth studying:

- **Action Network – ladders of engagement.** trigger → wait → decision-tree →
  action; email and SMS are interchangeable rungs; supports branching
  ("simulate a conversation"), time-windowed re-entry and sunsetting (e.g.
  re-evaluate engagement after 120 days). The closest market analogue to yarns
  "journeys".
- **CallHub – Workflows.** A clean trigger/condition/action grammar: triggers
  (tag added, message received, call/text disposition), conditions (if/else),
  actions (add-to-list, tag, send, webhook, wait delay). **Tags are the universal
  join between channels.**

Everyone else is manual (Reach action cards, OutreachCircle reminders) or
single-hop (Hustle keyword auto-reply + one reminder).

**Lesson for yarns:** build a real trigger → condition → action journey engine on
the existing BullMQ queues, where **door-knock tasks and P2P text sends are
first-class rung actions**, dispositions/tags are triggers, and any rung can
hand off to a human in the inbox. This is the single biggest feature gap in the
market and yarns' clearest differentiator.

---

## 6. Recommended disposition taxonomy

Distilled from VAN result codes, Qomon's 4-button model, Ecanvasser defaults and
OutreachCircle's non-contact set. Two layers, channel-aware:

**Contact result (did we reach a human?)**
- `SPOKE_TO_TARGET` – reached the intended person
- `SPOKE_TO_OTHER` – reached someone else at the address/number
- `NOT_HOME` / `NO_ANSWER` – nobody available (door / text-call equivalent)
- `CALL_BACK` / `COME_BACK_LATER` – reachable, try again
- `REFUSED` / `HOSTILE` – declined to engage

**Terminal / data-quality (flags the shared record as bad)**
- `MOVED`
- `WRONG_NUMBER` / `WRONG_ADDRESS`
- `DECEASED`
- `LANGUAGE_BARRIER`
- `DO_NOT_CONTACT` / opt-out

**Support / outcome (campaign-defined, layered on top)** – e.g. support level
1–5, "will volunteer", "wants info". Qomon layers a support level on top of the
4-button result; copy that separation of *contactability* from *position*.

Guardrails (from VAN): terminal codes need volunteer training and should write
back to flag the shared record; filter codes by channel (a "Walk" code set vs a
"Phone/Text" code set) so canvassers and texters see only relevant options.

---

## 7. Reliability bar to clear (launch requirements, not polish)

From the field-app complaints in the dossiers (MiniVAN, Qomon):
- Cross-canvasser / cross-device sync correctness (VAN's most cited bug).
- Genuine offline maps – cache tiles (Qomon's map is unavailable offline).
- GPS pin accuracy; battery drain; minimal taps for household entry.
- Server-owned conversation queue distribution so two texters never collide
  (CallHub does this well; yarns' current ownership is client-side localStorage
  only – see `apps/web/src/lib/responder-alerts.ts`).
