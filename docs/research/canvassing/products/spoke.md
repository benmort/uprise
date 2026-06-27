# Spoke – product dossier

Spoke is an open-source peer-to-peer (P2P) text-distribution platform. It was created by Saikat Chakrabarti and Sheena Pakanati, originally maintained by MoveOn.org, and has since been forked and re-developed several times. It is a direct open-source peer to uprise: same problem space (volunteer-driven P2P SMS at scale), same broad stack (Node/TypeScript + Postgres + GraphQL). Because the source and schema are public, its data model is the most useful thing here. [1][2][5]

There are several live lineages, and they matter for which "Spoke" you mean:

- **MoveOnOrg/Spoke** – the canonical upstream. Maintenance was transferred toward StateVoices/StateVoicesNational. JavaScript, GraphQL, Heroku/Lambda deploy. [1]
- **politics-rewired/Spoke** – Politics Rewired's fork (2019), re-architected for throughput. Node 16+, TypeScript, Postgres 11+, `graphile-worker` job queue, Knex migrations, Docker/Kubernetes. This fork explicitly abandoned upstream compatibility for development speed. It is the basis of the commercial **Spoke Rewired** managed service. [2][5]
- **Elizabeth-Warren/Spoke** – a campaign fork (historical, 2019–2020). [3]

Where the forks differ I note it; otherwise the model is common to all.

---

## 1. Positioning

Who it's for: political and advocacy organisations that need volunteers to send and reply to large volumes of one-to-one SMS – voter contact, GOTV, member mobilisation, event recruitment, fundraising asks. The texter UI is browser-based (phone, tablet, or desktop); the admin UI manages campaigns, scripts, and assignments. [1][4][14]

Electoral vs advocacy: both. Spoke is explicitly "P2P texting for politics" in its DNA, and the strongest integrations (NGPVAN/EveryAction) are electoral CRM tools. But it's equally used for issue advocacy and member organising, and MoveOn itself is an advocacy org. There is nothing electoral-specific baked into the core schema – contacts are generic. [1][9][12]

Geography: US-centric. Compliance assumptions (texting hours 9am–9pm local, opt-out semantics, Twilio/Assemble Switchboard as carriers, VAN as the CRM) are all US. Nothing prevents non-US deployment, but the defaults are American. [11][14]

Self-host vs managed: it's open source (self-host on Heroku/AWS/Kubernetes), but most real-world users buy a managed instance – Spoke Rewired (Politics Rewired) or Scale to Win run hosted Spoke. [2][8][12]

---

## 2. Full product scope

Core capabilities, drawn from the repos and docs: [1][2][4][6][7][11][14]

- **Campaign builder** – title/description, due date, branding (logo, primary colour, intro HTML), timezone and texting-hours enforcement.
- **Contact upload** – CSV upload with required `cell`, optional `firstName`, `lastName`, `zip`, `external_id`, plus arbitrary `customFields` (JSON) usable as script merge variables. Pluggable **contact loaders** (e.g. CSV, and integrations) let contacts be pulled from external sources.
- **Interaction steps (the script tree)** – a branching script of questions, answer options, and follow-up scripts. This is both the texter's guided script and the survey instrument.
- **Survey questions** – defined as interaction steps; texters log which answer a contact gave.
- **Canned responses** – a side menu of pre-written replies for off-script common questions.
- **Texter assignment** – static (admin assigns blocks) or **dynamic assignment** (texters self-request batches of initial sends or replies).
- **Texting workflow** – send initial messages (uneditable first text), then work replies through inbox buckets.
- **Tags** – organisation-level tags applied to contacts/conversations, with groups, descriptions, and optional auto-reassignment/escalation (e.g. to Slack).
- **Opt-out handling** – per-contact opt-out, with org-wide opt-out list.
- **Texting-hours enforcement** and **Send Later** bucket.
- **Action handlers** – live outbound sync of answers/tags to external systems (NGPVAN/EveryAction, ActionKit, Mobile Commons, Revere, OSDI). [9][10][12]
- **Data export** – CSV exports of contacts (+ survey responses) and messages; plus a dedicated **Export for VAN**. [6][13][15]
- **Dashboards/reporting** – campaign stats, assignment control, message review. [4]
- **Multi-tenant** – Organizations contain users, campaigns, tags, and teams.
- **Messaging back-ends** – Twilio and (Politics Rewired) Assemble Switchboard; `fakeservice` for dev. Auth via Auth0 (upstream). [1][2][5]
- **Bulk Script Editor** – find-and-replace across multiple campaigns' scripts. [4]

---

## 3. Canvassing / door-knock UX

Spoke does **not** do door-knocking or field canvassing. There is no walk list, no map/turf, no GPS, no offline mobile-field mode, no door-level disposition UI. It is purely a remote SMS contact tool. [1][4][14]

The relationship to canvassing is one-directional and via VAN: Spoke's survey/question responses are deliberately modelled to map onto VAN's **Survey Questions** and **Activist Codes** – the same canvass-result vocabulary a door program uses. So Spoke is a *sibling channel* to a canvass that shares a CRM, not a canvassing tool itself. [9][12]

This is exactly the gap uprise is targeting: uprise wants door-knock and P2P text sharing one script/survey model and one inbox. Spoke shows the survey-response → CRM-disposition mapping but only for the text channel.

---

## 4. Data model (detailed)

This is the most valuable part. Field names below are from the upstream GraphQL types and input types; the underlying Postgres tables use snake_case equivalents (`campaign_contact`, `interaction_step`, `question_response`, etc.). [7][8]

### Organization
`id`, `name`, `uuid`, texting-hours settings (`textingHoursStart/End`, `textingHoursEnforced`), `features` (JSON), `theme`. Owns campaigns, users (via `UserOrganization`), tags, teams, assignments. The tenancy root. [7]

### User
`id`, `firstName`, `lastName`, `alias`, `email`, `cell`, `isSuperadmin`, `auth0Id`, `extra` (JSON). Linked to organisations via `UserOrganization` (carries role); owns assignments and canned responses. [7]

### Campaign
`id`, `title`, `description`, `dueBy`, `organizationId`, `isStarted`, `isArchived`, `joinToken`; assignment config (`useDynamicAssignment`, `batchSize`, `responseWindow`, `requestAfterReply`); branding (`logoImageUrl`, `primaryColor`, `introHtml`); texting hours + `timezone`; messaging (`useOwnMessagingService`, `messageserviceSid`); `features` (JSON), `usedFields`. **Relations:** organization, assignments, interactionSteps, cannedResponses, contacts. [7]

A campaign is the unit that owns its own script tree, its own canned responses, and its own contact list. Scripts and canned responses are **not** organisation-level reusable entities (see §6 – this is a notable limitation).

### CampaignContact
`id`, `campaignId`, `assignmentId`, `cell`, `firstName`, `lastName`, `zip`, `external_id`, `messageStatus` (enum: needsMessage / needsResponse / convo / messaged / closed, etc.), `isOptedOut`, `customFields` (JSON). **Relations:** campaign, assignment, messages, tags, optOut, questionResponses. [7]

Critical schema fact: **there is no global Contact entity.** A person exists only as a `campaign_contact` row scoped to one campaign. Upload the same person into two campaigns and you get two unrelated rows. `external_id` (the VAN/CRM ID) is the only thread tying them back to a real person, and that linkage lives outside Spoke. [8]

### Message
`id`, `campaignContactId`, `text`, `isFromContact` (boolean direction flag), `sendStatus`, `userId`, `userNumber`, `contactNumber`, `messageserviceSid`, `service`, `errorCode`, `serviceId`. **Relations:** campaignContact. [7]

Messages hang directly off the contact, not a separate "conversation" entity – the conversation *is* the ordered set of messages for one `campaign_contact`.

### InteractionStep (the script/survey tree)
`id`, `campaignId`, `parentInteractionId`, `questionText`, `script`, `answerOption`, `isDeleted`, `answerActions`, `answerActionsData`. **Relations:** parent, children, campaign, questionResponses. [7][9]

This single self-referential table is both the **script** and the **survey**:
- A node with a `script` and a `questionText` is the texter's prompt + the survey question.
- Its child nodes each carry an `answerOption` (the label of one possible answer) and their own follow-up `script`.
- `parentInteractionId` builds the branching tree: answering option A on a question surfaces A's child script next.
- `answerActions` / `answerActionsData` attach an **action handler** (e.g. NGPVAN) so that choosing this answer fires an external sync.

So "a survey question" = an interaction step that has children; "an answer option" = a child interaction step. Elegant and compact, but it means questions and scripts are inseparable and live only inside one campaign.

### Question / AnswerOption
GraphQL convenience types that project over `InteractionStep` – `Question` wraps the question-bearing step and exposes its `answerOptions` (the children). Not separate tables. [7]

### QuestionResponse
`id`, `campaignContactId`, `interactionStepId`, `value`. **Relations:** campaignContact, interactionStep. [7]

This is the survey result: "for this contact, on this question (interaction step), the texter recorded answer `value`." One row per answered question per contact. This is the table that drives both CSV export and VAN sync.

### CannedResponse
`id`, `campaignId`, `userId`, `title`, `text`, `answerActions`, `answerActionsData`, `usedFields`. **Relations:** campaign, tags. [7][6]

Canned responses can also carry action handlers and tags, but – per the docs – using a canned response does **not** log a survey response. They are conversational shortcuts, not data-logging. [6]

### Tag
`id`, `organizationId`, `name`, `group`, `description`, `isDeleted`. **Relations:** organization, campaignContacts (many-to-many), cannedResponses. [7]

Tags are the one entity that is genuinely organisation-level and reusable across campaigns. They attach to contacts/conversations and can drive auto-reassignment/escalation. [14]

### Assignment
`id`, `campaignId`, `userId`, `userOrganizationId`. **Relations:** campaign, user, campaignContacts. The join between a texter and the slice of a campaign's contacts they own. [7]

### OptOut
Created from `OptOutInput` (`assignmentId`, `cell`, `reason`). Opt-outs are tracked per-cell and propagated org-wide so a number opted out anywhere isn't re-texted. [7][14]

### How outcomes sync out

Two distinct paths: [6][9][10][12][13][15]

1. **Batch CSV export (pull).** Admin clicks Export Data on a campaign; Spoke prepares files behind the scenes, uploads to an S3 bucket, and emails two download links (active ~24h):
   - **Campaign/contacts export** – one row per contact, including conversation status, custom fields, and survey responses.
   - **Messages export** – one row per message (direction, delivery status, segment count).
   - **Export for VAN** – a survey-response export shaped for re-upload into VAN, with options to specify the VAN-ID field and include/exclude unmessaged contacts.
2. **Live action handlers (push).** When a texter selects an answer (or canned response) that's wired to an action handler, Spoke calls that handler's `processAction` at the moment of selection. Built-in handlers: **NGPVAN/EveryAction** (answers → VAN Survey Question Responses; tags → Activist Codes), **ActionKit**, **Mobile Commons**, **Revere**, and an **OSDI** handler (for EveryAction, Action Network, and any OSDI-compatible system). The VAN handler auto-downloads available survey questions and activist codes and offers them as selectable actions in the script editor. Action Network is reachable via OSDI rather than a dedicated handler. [9][10][12]

---

## 5. P2P texting / inbox

Conversation model: a "conversation" is simply all `Message` rows for one `campaign_contact`, ordered by time, with `isFromContact` flagging direction. There's no separate thread entity and no cross-campaign conversation history for a person. [7]

Texter workflow: [11][14]
1. **Request a batch** (dynamic assignment) or open an assigned block.
2. **Send initial messages** – the first text is pre-written and **uneditable** (compliance: it keeps the opener consistent and on-script). Texters clear all initial sends first.
3. **Work replies** via inbox buckets: **Send Replies** (needs attention), **Past Messages**, **Skipped Messages**, **Send Later** (held until 9am recipient-local). Move through with Next/Close.
4. For each reply: pick the **survey response** that best matches what the contact said (logs a `question_response`), and/or insert a **canned response**, and/or type a **unique** reply. Apply **tags**. **Opt out** if requested (orange OPT OUT button pre-fills an unsubscribe message; can opt out silently for hostile contacts).

Assignment: [4][14]
- **Static** – admin assigns contact blocks to named texters.
- **Dynamic assignment** – texters self-serve a configurable number of conversations (initial sends or unhandled replies) from a request form. The **Assignment Control** admin page governs the request form, applied org-wide ("General") or per **team**. `batchSize`, `responseWindow`, and `requestAfterReply` tune the flow.

Scripting in the inbox: the texter sees the campaign's interaction-step script for the current node, the relevant survey answer buttons, and the canned-response sidebar. Choosing an answer can advance to the child step's script.

Opt-out: stored per-cell, propagated org-wide; opted-out numbers are excluded from future sends. [14]

---

## 6. Survey & script tooling

Three distinct constructs, easy to confuse: [4][6][9]

- **Interaction steps (scripts + survey questions)** – the branching script tree (§4). The *core* building block. Selecting an answer **logs a `question_response`** and can **fire an action handler**. This is where campaign data comes from.
- **Survey responses** – not a separate object; just the act of recording an answer option on an interaction step. "Survey responses constitute the core building blocks of campaigns... each with prepared scripts and logging data about how the contact responded simultaneously." [6]
- **Canned responses** – a flat menu of titled, pre-written replies for off-script FAQs ("How did you get my number?"). They **do not log survey data**. Use them for conversation, not measurement. [6]

Reusability – the key weakness: scripts/interaction steps and canned responses are **owned by a single campaign** (`campaignId` FK). There is no first-class "shared script library" or "shared survey" entity reusable across campaigns. The only cross-campaign reuse mechanisms are: copying a campaign, the **Bulk Script Editor** find-and-replace across campaigns, and the org-level **tag** taxonomy. Surveys can't be authored once and attached to many campaigns. [4][7]

This is the single most important schema lesson for uprise (see §11): if you want one script/survey to drive *both* a door interface and a text interface, the script/survey must be a standalone, reusable entity – not a child of a campaign.

---

## 7. Journeys / engagement ladders

Spoke has **no** journeys, sequences, cadences, drip automation, or engagement-ladder feature. There is no native scheduling of follow-up messages over days, no automated multi-step contact plan, and no per-contact lifecycle/state machine beyond `messageStatus`. [Unknown – not found in any source; corroborated by absence across the repos and docs.]

What exists in the neighbourhood:
- **Send Later** bucket – holds a reply until the contact's next legal texting window. Compliance scheduling, not a journey. [11]
- Branching **interaction steps** – conditional *within a single conversation*, not across time or campaigns.
- **graphile-worker** (Politics Rewired fork) – a generic DB-backed job queue used internally for async send/sync; it's infrastructure, not a user-facing journey builder. [2][5]

To run an "engagement ladder" with Spoke you create separate campaigns and re-load contacts into each – sequencing is a human/operational process, not a product feature. This is a clear differentiation opportunity for uprise.

---

## 8. Disposition / tag taxonomy

Spoke splits "disposition" across two mechanisms: [6][7][14]

- **Question responses** (structured outcomes) – the answer a texter records on a survey question. This is the canvass-result equivalent: it maps to VAN Survey Question Responses on sync. Closed-vocabulary, defined by the campaign's interaction-step answer options. There is no fixed global disposition list – each campaign defines its own answer options.
- **Tags** (cross-cutting labels) – org-level, with `group`, `name`, `description`. Used for things outside the survey flow: language spoken, needs-escalation, wants-a-yard-sign, hostile, etc. Tags can trigger auto-reassignment to specialist texters and map to VAN Activist Codes on sync. Tags are the closest thing to a reusable org-wide taxonomy.

`messageStatus` on the contact (needsMessage / needsResponse / convo / messaged / closed / etc.) is a workflow state, distinct from outcome disposition. [7]

Net: outcomes that need to count = question responses (per-campaign, structured, sync to VAN); attributes/flags that recur = tags (org-wide, reusable).

---

## 9. Pricing & access model

The software is **free and open source** (MoveOnOrg/Spoke and politics-rewired/Spoke on GitHub). The real cost is hosting + carrier fees + ops labour. [1][2][5]

Self-host cost realities: [1][16]
- Heroku: free tier for testing; production typically ~US$75/month for app infra (upstream README guidance), plus a database.
- AWS Lambda: cheaper at scale but materially higher technical overhead; Politics Rewired runs Kubernetes internally.
- Per-message carrier cost via Twilio historically ~US$0.0075/SMS each way, plus number rental.
- Running it well needs real DevOps – queue tuning, carrier/10DLC registration, deliverability, scaling Postgres.

Managed Spoke (Spoke Rewired / Politics Rewired) pricing, as published: [16]
- SMS segments: **1¢** each, inbound and outbound.
- MMS segments: **3¢** each.
- Contact (cell) validation: **¼¢ ($0.0025)** per cell.
- "Same per-message cost as self-hosting, minus the infrastructure burden"; no setup fee; bulk/commitment discounts. Scale to Win also offers managed Spoke. [8][12][16]

Note the **segment** unit: long messages and non-GSM characters (emoji, smart quotes) split into multiple segments and bill per segment. [16]

---

## 10. Strengths & gaps

Strengths:
- **Open source, inspectable, forkable** – the entire data model and texter UX are public to learn from. [1][2]
- **Compact, well-judged survey model** – the self-referential interaction-step tree unifies script + survey + branching in one table, and answer selection logs structured data *in the same gesture* the texter is already making. [6][7]
- **Real CRM sync** – live action handlers push answers→VAN survey responses and tags→activist codes, plus a purpose-built Export-for-VAN. Genuinely production-grade for electoral data ops. [9][12][13]
- **Dynamic assignment** – texters self-serve work; scales volunteer throughput without admin micromanagement. [4]
- **Compliance-aware** – uneditable first message, texting-hours enforcement, Send Later, org-wide opt-out. [11][14]
- **Throughput-tuned fork** – Politics Rewired's `graphile-worker`/Postgres re-architecture handles high send volumes. [2][5]

Gaps:
- **No global contact entity** – contacts are per-campaign rows; no unified person history, no cross-campaign view, dedup only via external IDs. [8]
- **No reusable scripts/surveys** – script + survey are locked inside one campaign; sharing is copy-paste or bulk find-replace. [4][7]
- **No journeys/sequencing** – zero native multi-step engagement automation. [§7]
- **No canvassing/field** – SMS only; no door, turf, or offline mobile. [1]
- **Canned responses don't log data** – a real footgun; texters who reach for a canned reply silently skip measurement. [6]
- **Heavy ops burden to self-host** – effectively pushes most users to a paid managed instance. [1][16]
- **US-centric assumptions** throughout (carriers, VAN, hours, opt-out). [14]

---

## 11. What uprise should borrow / avoid

uprise is also Node + Postgres, so the schema lessons transfer directly.

Borrow:
- **The interaction-step pattern, but lifted out of the campaign.** Spoke's self-referential question→answer-option→child-script tree is a clean way to model a branching script that is *simultaneously* a survey. Adopt the shape (a node carries `script` + optional `question`; children carry `answer_option` + follow-up script; `parent_id` builds the branch). uprise' requirement that one script/survey drive *both* the door and the text interface means this tree must be a **standalone, reusable `script`/`survey` entity** that campaigns/journeys *reference*, not own. This is the headline correction to Spoke.
- **Log the answer in the same action as the conversation move.** Spoke's best idea: picking the answer that captures the reply both advances the script and writes the `question_response`. Replicate this for both door and text so disposition capture is frictionless and identical across channels.
- **Two-tier disposition: structured per-script answers + reusable org-level tags.** Keep campaign/script-specific outcomes as question responses; keep recurring attributes (language, needs follow-up, volunteer-interested) as org-wide tags that any channel can apply. This split is sound – carry it over, and make the tag taxonomy power uprise' journeys (a tag can be a journey trigger).
- **Answer-attached actions.** Spoke's `answerActions`/`answerActionsData` on a step (fire a sync/side-effect when an answer is chosen) is a tidy hook. uprise can use the same pattern to trigger journey enrolment, CRM sync, or a canned-response surface when a disposition is logged.
- **Dynamic assignment + batch model** for the texting inbox; and reuse the inbox-bucket UX (needs-reply / send-later / past) – it's proven.
- **Compliance primitives**: uneditable opener, texting-hours/quiet-hours enforcement, org-wide opt-out propagation, opt-out as its own entity.
- **Async sync via a DB-backed job queue** (Politics Rewired uses graphile-worker on Postgres) rather than ad-hoc inline calls.

Avoid:
- **Don't make contacts per-campaign.** This is Spoke's biggest structural mistake for uprise' goals. uprise needs a **first-class Contact/Person** that persists across campaigns, channels (door + text), journeys, and dispositions – with campaign participation as a join. Without it you cannot do journeys, cross-channel history, or "this person was door-knocked then texted." Build the global person entity from day one.
- **Don't bind canned responses (or scripts/surveys) to a single campaign.** Make canned responses a shared, taggable library reusable across door and text. uprise' brief explicitly wants script/survey tooling that drives canned responses in *both* interfaces – Spoke's per-campaign ownership directly blocks that.
- **Don't let canned/quick responses skip data capture.** Spoke's canned responses log nothing. In uprise, surfacing a canned response from a survey answer should still record the disposition. Couple the response to the answer.
- **Don't conflate workflow state with outcome.** Keep `messageStatus`-style workflow state separate from disposition (question response). Spoke does keep them separate – preserve that.
- **Don't treat sequencing as an operational afterthought.** Spoke has no journeys, forcing manual campaign-cloning. Since journeys are a core uprise feature, model a per-person journey/enrolment state machine explicitly, driven by dispositions and tags from both channels.

---

## 12. Sources

- [1] MoveOnOrg/Spoke (canonical repo + README): https://github.com/MoveOnOrg/Spoke
- [2] politics-rewired/Spoke (fork README, stack, graphile-worker/Knex): https://github.com/politics-rewired/Spoke
- [3] Elizabeth-Warren/Spoke (campaign fork): https://github.com/Elizabeth-Warren/Spoke
- [4] Spoke Rewired knowledge base – build a campaign / assignment control / bulk script editor (search index): https://docs.spokerewired.com/
- [5] politics-rewired/Spoke migration & architecture doc: https://github.com/politics-rewired/Spoke/blob/main/docs/HOWTO_migrate-from-moveon-main.md
- [6] Survey Responses vs. Canned Responses – Spoke Rewired KB / WtR mirror: https://wtr-docs.pages.dev/docs/spoke-admin/canned_responses/
- [7] Spoke GraphQL schema & API types (Campaign/CampaignContact/Message/InteractionStep/QuestionResponse/Tag/Assignment/OptOut): https://github.com/MoveOnOrg/Spoke/tree/main/src/api and https://raw.githubusercontent.com/MoveOnOrg/Spoke/main/src/api/schema.js
- [8] Spoke schema discussion – no contact independent of a campaign; tags on campaign_contact (issue/PR threads): https://github.com/MoveOnOrg/Spoke/pull/1166
- [9] HOWTO use action handlers – NGPVAN/EveryAction, ActionKit, Mobile Commons, Revere, OSDI: https://github.com/MoveOnOrg/Spoke/blob/main/docs/HOWTO-use-action-handlers.md
- [10] OSDI action handler PR (people/questions/answers/messages import & sync): https://github.com/MoveOnOrg/Spoke/pull/1166
- [11] Texter Training Guide (inbox buckets, initial vs replies, opt-out) – WtR mirror: https://wtr-docs.pages.dev/docs/spoke-texters/texter_training_guide/
- [12] VAN integration directions (survey questions/activist codes mapping) – Scale to Win KB: https://scaletowin.freshdesk.com/support/solutions/articles/66000228339-directions-for-van-integration
- [13] Exporting campaign data (campaign export, messages export, Export for VAN) – Spoke Rewired KB: https://docs.spokerewired.com/article/71-export-data-from-a-campaign
- [14] Coda Spoke overview (features, opt-out, escalation/Slack, mobile UI): https://coda.io/@arena/spoke
- [15] HOWTO data exporting (S3, emailed links) – MoveOnOrg/Spoke: https://github.com/MoveOnOrg/Spoke/blob/main/docs/HOWTO_DATA_EXPORTING.md
- [16] Billing & pricing (1¢ SMS segment, 3¢ MMS, ¼¢ validation) – Spoke Rewired KB: https://docs.spokerewired.com/article/109-billing-pricing
