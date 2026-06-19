# yarns direction – door-knocking coupled with the P2P inbox

How the market findings (see `synthesis.md` and `products/`) map onto yarns'
actual code. This is **direction, not an implementation spec** – it names the
shape, the reusable pieces, and the forks to settle in a later planning round.
Date: 2026-06-16.

## Where yarns stands today (the relevant code)

- **Conversations key on a phone string, not a person.**
  `ConversationState` is unique on `(organizationId, contactPhone)`
  (`apps/api/prisma/schema.prisma:313`). The inbox merges rows by normalised
  phone (`apps/api/src/inbox/inbox.service.ts:138` `listConversations`).
- **Contacts are per-audience rows**, unique on `(audienceId, phoneE164)`, with a
  free-form `metadata Json` field (`schema.prisma:116` `AudienceContact`). The
  same human in two audiences is two rows. No global person entity.
- **No address/geo, no disposition/tag, no script/survey, no journey.** Confirmed
  across the schema.
- **Inbox composer** sends via `reply()` and offers canned text via `suggest()`,
  which returns three hardcoded strings from `ai-suggestions.service.ts`.
- **Ownership/assignment is client-side only** – browser localStorage in
  `apps/web/src/lib/responder-alerts.ts`. Lost on device change; two texters can
  collide.
- **Campaigns** are `Blast` → `BlastRecipient`; sending runs through BullMQ
  (`apps/worker/src/main.ts`, queues in `apps/api/src/common/queue/`).
- **Integration sync** (`apps/api/src/integrations/`) maps external contacts and
  already stuffs custom fields into `AudienceContact.metadata`.

yarns today repeats the exact structural mistake the ThruText and Spoke dossiers
flag as their worst: **conversation and contact data keyed to a campaign/phone,
not a persistent person.** Fixing this is the foundation for coupling door and
text.

## The one foundational change: a persistent Contact spine

Introduce a `Contact` entity (org-scoped, deduplicated on normalised phone and
later address) that both `AudienceContact` rows and `ConversationState` point at.
Every touch – inbound/outbound SMS, door knock, disposition, survey response –
hangs off `Contact`, giving the single timeline that Impactive, Qomon, Reach and
OutreachCircle prove is the right model. `ConversationState` becomes a view over
the contact's message + door-knock events rather than a phone-keyed silo.

This is the prerequisite for "intelligently coupled". Without it, door-knock and
text data sit in separate keyspaces and can only be reconciled by phone-string
luck.

## Proposed new domain + shared layer

A `door-knocking` (canvassing) NestJS module under `apps/api/src/canvassing/`,
mirroring the `blasts`/`inbox` module conventions, plus a **shared engagement
layer** that both the inbox and the door interface consume. New Prisma models
(names indicative):

**Shared layer (used by door AND text):**
- `Script` / `ScriptStep` – the two-layer / interaction-tree model from Impactive
  and Spoke: an initial script plus outcome-keyed response steps. One `Script`
  is attachable to a blast/journey and to a door workflow.
- `Survey` → `Question` (typed) → `QuestionOption` – reusable, authored once
  (the Action Network / VAN canonical-question pattern). A question's options
  render as **door disposition buttons** and as **text canned replies** from the
  same object.
- `CannedResponse` – three-tier visibility (org "recommended", personal "mine",
  auto-send), per ThruText/Hustle. Using one **always logs a disposition**
  (fixing Spoke's silent data-drop). Replaces the hardcoded
  `ai-suggestions.service.ts` fallbacks with a real library; AI suggestions
  become a ranking layer over it.
- `Disposition` taxonomy – the two-layer, channel-aware set in
  `synthesis.md` §6 (contact-result + terminal/data-quality, with a separate
  campaign-defined support level). Stored on the shared `Contact`, tagged with
  channel + campaign.
- `QuestionResponse` – a survey answer stored against `Contact`, with channel and
  campaign provenance, syncable out via the existing integrations layer.

**Canvassing-specific:**
- `CanvassCampaign`, `Turf` (a set of addresses/contacts), `WalkListItem`
  (address/contact + order), `CanvassAssignment` (server-side, fixing the
  localStorage gap), `DoorKnock` (a logged visit: disposition + survey response
  + GPS + notes, hung off `Contact`).
- Address/geo: per the earlier exploration, **start in `Contact`/metadata**
  (channel-agnostic), promote `address`, `lat`, `lng`, `turfId` to columns when
  querying/maps demand it. Populate via the integration sync mapper (extend
  `integrations.service.ts`) and CSV import (reuse the audience CSV path).

## The four couplings, concretely

1. **Shared contact timeline.** Both `/inbox` and the door screen read the
   `Contact` event timeline. The inbox thread (`getThread`) gains door-knock
   events; the door screen shows recent texts. One reconciled history.
2. **Outcome → cross-channel state.** A door `DoorKnock` disposition and a text
   reply both write to the contact's disposition + `ConversationState` filters
   (e.g. a "follow-up" disposition surfaces the conversation in an inbox filter,
   extending the existing `unresolved`/`priority` filters).
3. **Auto follow-up on outcome → journeys.** A `Journey` engine (trigger →
   condition → action) on the existing BullMQ queues, modelled on CallHub
   Workflows + AN ladders. Triggers: disposition set, message received, survey
   answer, no-answer-after-N. Actions: queue a blast/P2P text, create a door-knock
   task, tag, wait, hand to a human. **Door tasks and text sends are first-class
   rung actions.** This is yarns' clearest differentiator – no competitor does
   cross-channel door+text automation.
4. **Two-way handoff.** A "next action" on `Contact` lets a texter route a contact
   to a canvasser's walk list and a canvasser flag a contact for texting.

## Reuse, don't rebuild

- Send path: P2P texts from journeys reuse the `Blast`/`BlastRecipient` +
  `blasts.service` BullMQ send pipeline; replies already flow through
  `webhooks` → `inbox.recordInbound`.
- Inbox composer (`reply()`/`suggest()`) becomes a consumer of the shared
  `CannedResponse`/`Script` library instead of hardcoded strings.
- Assignment: replace localStorage ownership with `CanvassAssignment` +
  server-owned conversation claim (also fixes the texter-collision risk).
- Integration sync + CSV import already write to `metadata`; extend the mapper
  for address fields rather than building a new ingest path.
- Realtime SSE (`RealtimeEventsService`, `inbox.inbound`/`inbox.reply` events)
  extends to door-knock and journey events.

## Forks to settle in the implementation-planning round

- **Turf depth**: walk lists only vs walk lists + map vs full turf-cutting +
  routing (Qomon/Ecanvasser set the high bar; the reliability bar in
  `synthesis.md` §7 is the real cost).
- **Field UX**: mobile-first PWA/native for canvassers vs desktop. Door-knocking
  is a phone-in-hand, often-offline activity – offline + GPS + battery are
  launch requirements, not polish.
- **Geocoding provider** (Google/Mapbox/OSM) and whether to add PostGIS.
- **Journey engine scope**: how much of the trigger/condition/action grammar
  ships in v1.
- **Contact-spine migration**: how to backfill `Contact` from existing
  `AudienceContact` + `ConversationState` without breaking the live inbox.

## Bottom line

The market has no product that unifies door-knocking and a P2P texting inbox
around one contact with shared scripts/surveys and real cross-channel automation.
That is precisely yarns' opening. The work divides into: (1) a persistent
`Contact` spine, (2) a shared `Script`/`Survey`/`CannedResponse`/`Disposition`
layer feeding both interfaces, (3) a canvassing domain, and (4) a journeys
engine on the existing queue infrastructure. Do (1) and (2) first – they make the
coupling possible and immediately improve the existing inbox.
