# Action Network – product dossier

Research date: 2026-06-16. Prepared for the yarns canvassing + journeys build. Australian English throughout.

Action Network (actionnetwork.org) is a long-running US progressive advocacy/organising platform built by Action Squared, the same outfit behind Action Builder. yarns already integrates with it (yarns syncs audiences from Action Network), so its person/tag/ladder model is directly relevant. The single most important finding: Action Network's **ladders of engagement** are the closest market analogue to yarns "journeys", and Action Network itself does **no canvassing** and **no P2P texting** – that work is pushed to its sibling product Action Builder and to broadcast SMS respectively. [1][2][7][13]

---

## 1. Positioning

- **Who it's for:** progressive advocacy organisations, unions, campaigns, non-profits and "movement" groups running list-building, mobilisation and supporter engagement. Action Network explicitly partners only with progressive causes; partnership eligibility is gated (email join@actionnetwork.org). [9]
- **Geography:** primarily US, but used internationally (e.g. Extinction Rebellion UK runs on it). The data model is US-centric – addresses default to US country code, target legislators keyed on OCD IDs, OSDI is a US open-data standard. [4][8][13]
- **Advocacy vs electoral:** firmly **advocacy / issue organising and mobilisation**, not field-side electoral canvassing. The toolset is petitions, letters-to-targets, events, fundraising, email and broadcast SMS. Door-to-door, relational and one-to-one organising are explicitly the remit of the sibling product Action Builder, not Action Network. [2][7][13]
- **Sibling split (important):** Action Network = "mobilising" (broad, low-friction asks at scale). Action Builder = "organising" (one-to-one, leader development, canvassing/door-knock/phone/text-bank tasks). Both built by Action Squared; they integrate. [2][7]

---

## 2. Full product scope

Core action types and tooling: [4][8]

- **Petitions** (sign + deliver to targets)
- **Letter/advocacy campaigns** ("outreaches" to political targets such as legislators – email letters and phone calls)
- **Events** (RSVP, ticketed events, event campaigns, event maps)
- **Forms** (general data collection)
- **Surveys** (launched 2024 – multi-question data collection) [12]
- **Fundraising pages** (with/without tip jar; ActBlue integration)
- **Email** (mass email, "messages", with email templates called "wrappers")
- **Mobile messaging** (broadcast SMS, via Twilio – see §5)
- **Call campaigns** (phone-based outreach to targets)
- **Ladders** (automation / engagement sequences – see §7)
- **Lists** (formerly "Queries" – saved segments; targeting filters)
- **Tags & taggings** (see §4/§8)
- **Custom fields / questions** (reusable; see §4/§6)
- **Reporting** (custom reporting via natural language on higher tiers; "Boost" add-on)
- **Data co-op** (cooperative data with ML predictions, Boost add-on)
- **Groups & hierarchies** (parent/child groups, data flowing up, multi-level admin on Network tier)
- **Full OSDI API + webhooks**, plus integrations (Salesforce, Zapier, ActBlue) [4]

---

## 3. Canvassing / door-knock UX

**Action Network does not do canvassing.** There is no turf-cutting, no door-knock list, no walk-list app, no field canvasser mobile experience, no door-disposition recording. [2][7]

- The nearest concept in the API is the **outreach** resource (a record that an activist contacted a target), but that is for letters-to-legislators and call campaigns – not field canvassing of voters/supporters at the door. The record-outreach helper has `targets`, `subject`, `message`, `duration` (calls) – nothing geospatial or door-related. [3]
- Canvassing is deliberately the job of **Action Builder** (the sibling), which has explicit "canvassing tasks": door-knocking / house visits, phone-banking and text-banking, with turf creation (and Google Maps routing limits of 21 addresses). Action Builder maps its responses back to Action Network **tags** via the integration. [2][7]
- **Relevance to yarns:** Action Network is the *mobilisation/CRM* layer that yarns already syncs from. It is not a competitor for the door-knock feature itself – Action Builder is the closer analogue for canvassing. The integration pattern worth noting is "AB door/field responses → AN tags", i.e. field outcomes collapse into a flat tag namespace on the central person record. [2]

---

## 4. Data model

OSDI-based. The API conforms to **OSDI 1.1.1**, returns HAL+JSON, entry point `https://actionnetwork.org/api/v2`, auth via `OSDI-API-Token` header, rate limit 4 calls/sec. Group API keys unlock tag management. [4][13]

**Person / activist resource:** [13]
- Requires either an email or a phone number.
- `given_name`, `family_name`.
- `email_addresses[]`: each has `address`, `primary` (bool), `status` (subscribed, unsubscribed, bouncing, spam complaint, previous variants). Email is the **primary deduplication key**.
- `phone_numbers[]`: `number` (international format, no plus), `number_type` (always "mobile"), `primary`, `status`. Auto-dedup/merge on collision.
- `postal_addresses[]`: nested objects with `address_lines[]`, `locality`, `region` (ISO 3166-2), `postal_code`, `country` (ISO 3166-1 alpha-2, defaults US), and `location` (lat/long + geocode accuracy). Auto-geocoded.
- `languages_spoken[]` (ISO 639 codes).
- `custom_fields`: key-value object for org-specific data, tied to custom questions.
- `identifiers[]`: `[system]:[id]`, globally unique – the cross-system join key.
- System timestamps `created_date` / `modified_date`.
- Embedded action history: `osdi:attendances`, `osdi:signatures`, `osdi:submissions`, `osdi:donations`, `osdi:outreaches`, `osdi:taggings`, `action_network:responses`.

**Tags & taggings:** [1]
- **Tags** are named resources created in the UI (available only with group API keys).
- **Taggings** represent the *state* of a person holding a tag, linked to the person resource. Deduplicated per person (one tagging per person per tag).
- When writing via the person model, `add_tags` / `remove_tags` arrays are **matched by tag name**; unmatched names are silently ignored; add runs before remove. So tags are a flat, name-keyed namespace – there is no hierarchy or typed value, just presence/absence.

**Custom fields:** [11]
- Read-only via API (defined in the UI, not creatable via API). Live at `/api/v2/metadata/custom_fields`.
- Each has `name`, `notes`, `numeric_id`, `origin_system`, timestamps.
- Appear on the person as `action_network:custom_fields`; the metadata endpoint defines *what fields exist*, the values live on each person.

**How outcomes/actions are recorded:** as discrete OSDI action records attached to the person – `signatures` (petitions), `submissions` (forms), `attendances` (events), `responses` (surveys), `outreaches` (letters/calls), `donations`. Each can carry `add_tags` and `action_network:referrer_data` (source / referrer code / which email or SMS prompted it). Webhooks fire on each action type. [3][4]

---

## 5. P2P texting / inbox

**No P2P. No conversational inbox.** Action Network mobile messaging is **broadcast SMS** ("blast texts"), sent through the same UI and targeting engine as email, running on **Twilio** underneath. [5][6][10]

- **Send side:** broadcast to segments, with the same targeting filters as email plus "past mobile messages" and "mobile click activity". Tracks clicks, actions, bounces. [6][10]
- **Inbound handling:** only **keyword auto-responses**, not conversations. Twilio handles standard reply keywords – HELP/AIDE/INFO and STOP/ARRET/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT – returning your default Help or Unsubscribe message. You can set custom HELP and UNSUBSCRIBE default responses. There is **no agent-facing inbox, no one-to-one threaded conversation view, no human reply workflow**. [14]
- **Compliance:** standard short-code/A2P language required ("Msg & data rates may apply. Reply STOP to stop. Reply HELP for help."). Number types: toll-free (~$0.4888/mo+), short codes (~$1,222/mo+). [9][14]
- **Channels:** email and SMS coexist as parallel broadcast channels inside ladders (you can test email vs SMS in the same series). [6]

**Relevance to yarns:** Action Network is the polar opposite of yarns on messaging – pure broadcast with keyword auto-replies, no conversational P2P. yarns' P2P inbox is a genuine differentiator AN does not attempt. What AN does well that yarns should match: SMS and email are the *same* automation/targeting surface, not bolted-on silos.

---

## 6. Survey & script tooling

Strong, and the reusability model is the standout. [10][12]

- **Forms:** free-form data collection – any question, any format (stories, surveys, results capture).
- **Surveys:** dedicated multi-question survey type (2024). Results downloadable as CSV with activist details + per-question answers.
- **Visual form builder:** drag-in blank questions (ad-hoc) or insert pre-built questions. Question types include text, checkbox, radio, dropdown; checkbox/radio/dropdown can have an "Other" option.
- **Reusable questions ("Core and Custom Questions"):** pre-built in the Questions and Custom Fields page (Details menu). **Editing a pre-built question updates it on every form/survey it's attached to** – questions stay in sync across actions, and each pre-built question maps to a custom field on the person record. This is the key reuse pattern: one canonical question → consistent custom-field data wherever it's asked. [10]
- **No scripting concept for live conversation.** There is no canvasser/texter script with branching canned responses – questions are for form/survey self-submission. (The branching "scripted conversation" idea exists only inside ladders as automated decision trees – see §7.)

**Relevance to yarns:** the "edit once, propagate everywhere, backed by one canonical custom field" model is exactly what yarns wants for shareable scripts/surveys that drive both door and text interfaces. Borrow it directly: a question is a first-class reusable object bound to a single field, not copied per script.

---

## 7. Journeys / engagement ladders (the key analogue)

**Ladders** are Action Network's automation engine: "an automated series of actions an activist goes through if they meet certain conditions, called **triggers**." They are the direct analogue to yarns "journeys". [1][7][15]

**Mental model:** a ladder has **rungs** (steps). Activists climb the ladder over time as they meet conditions. The pitch is "design sophisticated campaign journeys... and the ability to send activists down different paths with decision trees means you can simulate a conversation – like asking about an activist's interests or volunteer capacity – entirely automatically." [1][15]

**Components:** [1][7][15]
- **Triggers / entry points:** an activist enters when they subscribe to the list, or take a specific action. You can now create a ladder *directly from* an action, an email, or a mobile message (the action that prompts entry doubles as the ladder's anchor).
- **Wait times / delays:** explicit delays between rungs (e.g. "one day later... then a few days later") so the sequence "feel[s] like they're chatting with an organizer in real time."
- **Decision trees / branching:** conditions route people down different paths. The canonical example is a survey-driven branch – "if an activist responds 'A', your follow up could say 'Thanks for your response!'"; a mobile survey template "filters activists through a series of decision steps and sends a custom response based on how they answer." Branches can key off geography ("if no, send an email asking to chip in" / target by location) and prior engagement. [7][15]
- **Actions (rung payloads):** send an email, send a mobile message, and integrate the Call Campaign tool. Channels mix freely within one ladder. [6][15]
- **Re-entry / evaluation windows:** ladders support recurring evaluation – the reactivation/sunsetting pattern triggers people in each time they receive an email and, after 120 days, evaluates whether they engaged at all (and sunsets if not). So a ladder can re-trigger and run time-windowed conditional checks on engagement, not just fire once. [1]
- **Live-editable:** "change your ladder and its rungs at any time, or just let it go to work." [7]

**Templates:** email welcome series, mobile welcome series, email reactivation campaign, action-follow-up (mobile + email), and a mobile survey template – plus a blank slate. [1][15]

**Documented use cases:** welcome series; full campaign plan (petition → letter → donation, branching on what the person actually did); reactivation/sunsetting. [1][8]

---

## 8. Disposition / outcome taxonomy

There is no rich disposition taxonomy like a canvassing tool's (e.g. "not home / refused / moved / supporter"). Outcomes are modelled two ways: [1][3][4]

- **Typed action records** – the *fact* of an action is captured by its resource type: signature, submission, attendance, response, outreach, donation. That's the coarse "what did they do" layer, queryable and webhook-able.
- **Tags** – the fine-grained, org-defined categorisation layer. Tags are a **flat, name-keyed namespace** (presence/absence per person, deduplicated). Every action record and outreach can `add_tags`/`remove_tags`. This is the mechanism Action Builder uses to push field/door responses back as AN tags. [1][2]
- **Survey/form responses** – stored as values in **custom fields** (one canonical field per reusable question), giving structured answer-level data beyond tags. [11][12]

So the taxonomy is: action *type* (fixed OSDI vocabulary) + tags (flat, free) + custom-field values (structured). No native enum of "outcomes" and no door-specific dispositions.

---

## 9. Pricing & access model

No setup fees, no contracts, monthly card billing, cancel anytime, you own/export your data. Progressive-only; partnership applications required. [9]

- **Free plan:** for grassroots activists building a list – core action tools (petitions, events, letters, forms, fundraisers, ticketed events). [4]
- **Movement Partnership – from $15/mo:** email $1.25 per 1,000 sent ($15 min covers first ~12,000); mobile $10 per 1,000 messages ($50 min covers first 5,000) + telecom fees. Includes list upload, custom wrappers, **automated ladders**, fundraising, shapefiles, list-swap, full API + integrations (ActBlue, Salesforce, Zapier). Data co-op + NL custom reporting require the "Boost" add-on. [8][9]
- **Network Partnership – from $125/mo:** email $2.50 per 1,000 ($125 min covers first 50,000); mobile $20 per 1,000 ($100 min covers first 5,000) + telecom. Adds multi-group hierarchies, parent/child data roll-up, multi-level admin, separate group unsubscribes. [8]
- **Enterprise Partnership – custom:** 1M+ emails/mo, custom integrations, onboarding. [8]
- **Actions Only Partnership:** quote on request; ~$15/mo covering ~2,000 actions then ~$7.50/1,000 (multi-sponsor petition/letter campaigns). [9]
- **Mobile add-on:** requires an email partnership; toll-free numbers from ~$0.4888/mo, short codes from ~$1,222/mo. [9]

Pricing is **per email/action volume**, not per seat – cheap to add users, scales with send volume.

---

## 10. Strengths & gaps

**Strengths**
- OSDI-standard, well-documented API with webhooks – clean to integrate (yarns already does). [4][13]
- Single targeting/automation surface across email and SMS – no channel silos. [6]
- Reusable canonical questions bound to custom fields – edit once, sync everywhere. [10]
- Mature ladder engine: branching decision trees, delays, re-entry, time-windowed conditional evaluation, templates. [1][15]
- Volume-based, no-seat pricing; free tier for small groups. [8][9]

**Gaps**
- **No canvassing / door-knock at all** – offloaded to Action Builder. [2][7]
- **No P2P / conversational SMS inbox** – broadcast + keyword auto-replies only. [6][14]
- **Tags are flat and name-matched** – no hierarchy, types or values; easy to create a sprawling, inconsistent tag namespace. [1]
- **Custom fields read-only via API and UI-defined** – integrators can't provision schema programmatically. [11]
- **No live conversation scripting** – branching "conversation" exists only as automated ladders, not as a human-driven script with canned responses. [10][15]
- US-centric data model (OCD IDs, US default address/legislator targeting). [3][13]

---

## 11. What yarns should borrow / avoid

**Borrow (especially for the journeys engine):**
1. **Ladder structure as the journeys model.** Trigger → wait → condition (decision tree) → action, with channels (door, SMS, email) as interchangeable rung payloads. yarns can go further than AN by making a **door-knock task** or **P2P text send** first-class rung actions alongside automated sends. [1][15]
2. **Time-windowed re-entry / evaluation.** AN's "trigger on each email, evaluate engagement after 120 days, sunset if cold" is a clean reusable pattern. Build journeys that can re-trigger and run delayed conditional checks against engagement, not just linear one-shot sequences. [1]
3. **"Simulate a conversation" branching as the design metaphor.** Frame the journey builder around survey-answer branches ("if they said A → response X"). This is exactly the script/canned-response coupling yarns wants between door and text. [1][7]
4. **One canonical reusable question → one field, edit-once-propagates.** Make script/survey questions first-class objects bound to a single custom field, shared across door and text interfaces, so editing the question updates every script and the data lands in one place. This is AN's best idea for yarns' shared script/survey tooling. [10]
5. **Templates for journeys** (welcome, reactivation, action-follow-up) to lower the blank-canvas barrier. [1][15]
6. **Build journeys directly from an action.** AN lets you spin a ladder off an existing action/message – yarns should let a journey be created from a canvass result or text reply in one step. [15]
7. **Unified targeting across channels** – one segment/filter engine feeding door, SMS and journeys, mirroring AN's "same filters for email and SMS". [6]

**Avoid:**
1. **Don't let tags be the only outcome model.** AN's flat, name-matched tag namespace becomes a mess at scale and can't express door dispositions cleanly. yarns should give canvassing/text **structured, typed dispositions** (an enum/taxonomy) *plus* tags, not tags alone. [1][8]
2. **Don't split canvassing into a separate product.** AN forces users into Action Builder for door work and syncs back via tags – a lossy, two-system seam. yarns' thesis (couple door + P2P inbox in one system) is the right call; keep door outcomes and text conversations on the *same* person timeline. [2]
3. **Don't ship broadcast-only SMS.** AN's keyword-auto-reply model is not conversation. yarns' P2P inbox is the differentiator – keep journeys able to *hand off to a human* in the inbox, not just auto-send. [6][14]
4. **Don't lock schema to the UI.** AN custom fields being API-read-only blocks programmatic provisioning – let yarns scripts/surveys define their fields programmatically. [11]

---

## 12. Sources

- [1] What are ladders? – https://help.actionnetwork.org/hc/en-us/articles/115002578463-What-are-ladders (and Taggings v2 – https://actionnetwork.org/docs/v2/taggings)
- [2] Action Builder vs Action Network / integration – https://actionbuilder.zendesk.com/hc/en-us/articles/22456122874772-What-is-Action-Network ; canvassing tasks – https://actionbuilder.zendesk.com/hc/en-us/articles/30551865065364-Canvassing-Tasks-Phone-Banking-Text-Banking-Door-Knocking-House-Visits
- [3] Record Outreach Helper v2 – https://actionnetwork.org/docs/v2/record_outreach_helper
- [4] API getting started / resource list – https://actionnetwork.org/docs
- [5] Introducing Mobile Messaging (blog) – https://actionnetwork.blog/introducing-mobile-messaging-on-action-network/
- [6] Introducing Mobile Messaging (Medium) – https://medium.com/powering-progressive-movements/introducing-mobile-messaging-on-action-network-7578d2aa5fde
- [7] Advocacy Automation – https://actionnetwork.org/advocacy-automation/
- [8] Action Network Plans / Get Started – https://actionnetwork.org/get-started/
- [9] Pricing / billing FAQ – https://help.actionnetwork.org/hc/en-us/articles/360040343291-How-does-pricing-and-billing-work ; mobile pricing – https://help.actionnetwork.org/hc/en-us/articles/4415521192852-US-Mobile-Messaging-Pricing-and-Fees
- [10] Forms, questions & custom fields (reusable questions) – https://help.actionnetwork.org/hc/en-us/articles/203112789-The-visual-form-builder-questions-and-custom-fields ; https://help.actionnetwork.org/hc/en-us/articles/203555949-Adding-questions-to-forms
- [11] Custom Fields v2 – https://actionnetwork.org/docs/v2/custom_fields
- [12] Creating surveys – https://help.actionnetwork.org/hc/en-us/articles/29686822416660-Creating-surveys
- [13] People v2 (person data model) – https://actionnetwork.org/docs/v2/people
- [14] HELP/UNSUBSCRIBE default responses & Twilio – https://help.actionnetwork.org/hc/en-us/articles/360042303792-Setting-default-HELP-and-UNSUBSCRIBE-responses-for-mobile-messaging
- [15] Ladders just got easier (Medium, builder UI) – https://medium.com/powering-progressive-movements/ladders-on-action-network-just-got-a-lot-easier-to-use-27ffcb922b61
