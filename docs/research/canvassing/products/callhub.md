# CallHub – Product Dossier

Research date: 2026-06-16. Focus: relevance to "uprise" (P2P SMS organising platform building door-knock canvassing coupled to its texting inbox, shared scripts/surveys, and journeys).

> Headline finding: CallHub is a genuine multi-channel outreach platform (calling, P2P texting, voice/text broadcast, email) with a real workflow-automation engine – but it does **not** ship a native door-to-door canvassing app. "Canvassing" in CallHub's marketing refers to phone/text outreach and to a partner integration (Ecanvasser) for field work. So CallHub is a strong reference for the **texting inbox + shared scripts + journeys** parts of uprise, and a cautionary reference (not a model) for the **door-knock** part. [1][2][3][4]

---

## 1. Positioning

- Multi-channel digital organising and outreach platform for **political campaigns, nonprofits, advocacy groups, and labour unions**, plus some commercial use. [5][6]
- Skews **progressive/advocacy and electoral** organising: voter ID, voter registration, GOTV, member outreach, fundraising, event RSVPs. [7]
- Geography: primarily **US/Canada-focused** (10DLC, NGP VAN/VoteBuilder, PDI, NationBuilder integrations; US/CA pricing page distinct from an "International" page). Company has Indian operations/engineering. Sells into multiple US states from local to national races. [5][8]
- Sits in the "unified campaigning tool" niche: explicit pitch is one clean contact list and one platform instead of splitting contacts across separate calling/texting tools. [2]

## 2. Full product scope

Channels and tools (all on a shared contact list): [1][2]

- **Call centre / phone banking** – multiple dialler types (predictive, power, preview, manual), browser-based calling, agent dashboard, scripts, dispositions, surveys, call recording, AI call summary and sentiment (paid add-on). [9][10]
- **Peer-to-peer (P2P) texting** – agent-managed 1:1 SMS at scale, Fast P2P bulk first-send, saved replies, MMS, surveys, tagging, opt-out handling. [1]
- **Text broadcast** – mass/bulk SMS. [2]
- **Voice broadcast** – automated calls/robocalls with transfer digits. [2][8]
- **Email marketing**. [2]
- **Text-to-Donate / Text-to-Join** – keyword-driven fundraising and list growth. [2]
- **Relational organising** – supporters reaching their own contacts. [2]
- **Workflows / automation** – cross-channel sequence engine (see §7). [4]
- **iOS/Android app** – for **phonebanking and P2P texting only**; no canvassing. [3]
- **No native door-knock canvassing, walk lists, turf maps, GPS, or offline field collection.** Field canvassing is delivered via the **Ecanvasser** integration. [3][11]

## 3. Canvassing / door-knock UX

**CallHub has no native door-knocking app.** This is the single most important finding for uprise.

- The homepage and platform pages describe CallHub as a **digital outreach platform** ("It supports channels like calling, SMS, and email, not printing or delivering physical direct mail"); the mobile app explicitly supports only phonebanking and P2P texting. [2][3]
- "Canvassing" on CallHub's blog/marketing is largely SEO content reviewing other people's canvassing tools, plus phone/text outreach framed as "canvassing." No walk-list assignment, turf cutting, map view, route optimisation, GPS tracking, or offline-first field data capture is offered by CallHub itself. [11][12]
- For real door-to-door, CallHub points to its **Ecanvasser integration**: Ecanvasser supplies the field app (offline canvassing, route planning, territory/turf management, real-time activity tracking), while CallHub supplies calling/texting. Data syncs both ways: CallHub call/SMS interactions update voter statuses in Ecanvasser via automation rules. [11]
- Practical implication: a campaign wanting "doors + texts in one tool" cannot get it from CallHub alone; it stitches CallHub + Ecanvasser. The shared-contact coupling that uprise wants to build **natively** is, in CallHub's world, a cross-product sync.

Walk lists, maps/turf, offline, mobile field assignment, at-door surveys (native): **Unknown / not offered – CallHub does not provide these; Ecanvasser does.** [3][11]

## 4. Data model

- **Contacts**: single unified contact list imported from CSV or synced from a CRM (NationBuilder, NGP VAN/VoteBuilder, Salesforce, Blackbaud, Action Network, PDI). Contacts carry custom fields and tags; "dynamic lists" refresh automatically based on tags/fields/CRM data and behaviour. [1][2][4]
- **Tags**: central to the model – used for segmentation, as workflow triggers, and as branch conditions. "Tag added"/"tag removed" are first-class events. [4]
- **Addresses / geo**: no native geo/turf model. Address-level/turf data lives in the CRM or in Ecanvasser, not in CallHub's own schema. [3][11] **Unknown – CallHub geo storage not found because it is not a field tool.**
- **Dispositions**: per-call (and per-outreach) outcome labels stored against the contact and the campaign (see §8). Both system defaults and custom dispositions. [13][14]
- **Survey responses**: questions are attached to a script; responses captured per contact and written back to the CRM in real time (e.g. NGP VAN survey questions, NationBuilder survey responses sync back). [13][15]
- **Storage / sync**: every interaction (call log, SMS reply, disposition, survey answer, tag) updates the contact record in real time and can be pushed to the CRM via webhook actions in Workflows. There is a public REST API and developer docs. [4][16]

## 5. P2P texting / inbox

This is CallHub's most directly relevant capability for uprise.

- **Conversation model**: agent-managed 1:1 SMS. The inbox separates **Pending** (contacts not yet sent an initial message) from **Chats** (contacts who have replied to the initial message). Agents work the queue, reply, tag, and add notes. [1][17]
- **Fast P2P**: initial messages can be sent in bulk so agents spend their time only on replies rather than manually sending each first text. A single agent can send "several hundred initial messages per hour." [1]
- **Assignment / queueing**: the platform distributes the contact queue across agents automatically – "no contact gets double-messaged and no agent sits idle." Unlimited agents; multiple agents work in parallel. [1]
- **Scripts / canned responses**: agents use **saved response templates** for quick replies, plus free-typed responses, merge tags for personalisation, and shortened/branded/tracked links inside replies. [1]
- **Surveys in texting**: survey questions (multiple-choice, text, numeric) can be answered during the conversation. [18]
- **Compliance**: automatic STOP/opt-out handling honoured across all future campaigns; consent tracking framed as TCPA-compliant because a human sends. AI profanity/spam filter strips abusive inbound replies. [1]
- **Media**: MMS (photos, videos, images). 10DLC registration handled by CallHub (~2 days) for deliverability. [1]
- **Relation to other channels**: replies/dispositions can route a contact into calls, voice broadcasts, or emails automatically via Workflows; every reply updates the shared contact record in real time. The handoff is **automation-mediated**, not a literal shared timeline view across channels. [1][4]

## 6. Survey & script tooling

- **Branching scripts**: campaign managers build scripts by adding questions and response options and linking each answer to the next section, producing interactive multi-path scripts. Live preview of branches while drafting. Merge tags personalise each branch. [19][9]
- **Question types**: multiple-choice, text, numeric (documented for texting surveys; calling scripts use questions with dropdown responses + note fields). [18][20]
- **Surveys**: questions attach to a script and capture per-contact responses; can pull survey questions directly from NGP VAN, and sync responses back to NGP VAN/NationBuilder. [13][15]
- **Reusability across channels**: scripts and surveys are configured **per campaign type**. Branching scripts are documented primarily for **calling**; texting has its own surveys/saved-replies; canvassing isn't a CallHub channel at all. There is **no clear single shared script/survey object reused across calling + texting + canvassing** the way uprise intends – cross-channel continuity is achieved by syncing responses to a CRM and by Workflows, not by one canonical script driving multiple front-ends. [19][1][3] This is a gap uprise can beat.

## 7. Journeys / engagement ladders – CallHub Workflows

CallHub's **Workflows (Workflow 2.0)** is the direct analogue to uprise "journeys." Drag-and-drop visual canvas; whole contact journey visualised before launch; one entry per contact by default (re-entry configurable). [4][21]

**Triggers** (events that start/advance a workflow): [4]
- Tag added
- Tag removed
- Call completed
- Outreach completed
- Initial message sent
- Message received
- Link clicked
- Suggested action clicked

**Conditions**:
- **Wait** – delay next step by minutes, hours, or days. [4]
- **If/Else branch** on: contact tag, survey response, call retry attempts, call disposition, message response, link clicked, transfer digit pressed. [4]

**Actions**:
- Add contact to campaign
- Add contact to list
- Add tag
- Remove tag
- Send data via webhook to external systems (NationBuilder, NGP VAN, Salesforce, Blackbaud, Action Network, PDI, etc.) [4]

**Use cases**: route voters first-touch-to-action, donor follow-up, volunteer sequences, member re-engagement – across political, nonprofit, advocacy, and union work. Each branch shows conversion tracking. [4][21]

Notable: triggers/conditions are heavily **calling- and texting-centric** (dispositions, transfer digits, message received). There is **no door-knock disposition trigger** because there's no door channel – another consequence of the missing canvassing app.

## 8. Disposition / outcome taxonomy

Dispositions are outcome labels on a call/outreach. CallHub ships **defaults** and allows **custom** dispositions; keep the set small for agent usability. [13][14]

Documented disposition values (from CallHub support and a practitioner field guide): [13][22]
- `BAD_NUMBER` – number not recognised / invalid
- `NO_ANSWER` – no response
- `LEFT_MESSAGE` – left voicemail or text
- `MEANINGFUL_INTERACTION` – recipient engaged
- `CALLBACK` – contact again later (agent sets preferred time via dropdown)
- `DO_NOT_CALL` / `DNC` – do-not-contact (suppresses future outreach)
- Plus "user busy" and "invalid number" surfaced in reporting buckets ("Other calls"). [23]

Texting/other channels: outcomes are expressed mainly through **tags, message-response branches, and opt-out (STOP)** rather than a separate door-style disposition list. [1][4] There is **no door-knock outcome set** (e.g. Not Home, Moved, Refused, Spoke-to-target) in CallHub because canvassing is not a native channel. [3]

## 9. Pricing & access model

US/CA pricing (per published pricing page, 2026): [24]

**Essential (pay-as-you-go, no minimum):**
- Voice calls: $0.071/min outbound; inbound SMS $0.012/segment
- SMS: $0.059/segment
- Voice broadcast: $0.048/min
- Call recordings: $0.019 each
- Spam Label Shield: $0.004/dial
- $6 free starter credits; up to 10,000 contacts; up to 10 agents; no commitment

**Scale (minimum $2,500 contract value):**
- Custom volume-based rates (quoted); typically 10–30% cheaper than Essential at higher volume
- Unlimited contacts and agents
- Call recordings $0.01 each; Spam Label Shield free
- Dedicated Customer Success Manager, priority support, Dynamic Caller ID, profanity filter, language routing, custom integrations

**Add-on (both plans):** AI Summary & Call Sentiment $0.01 per recording analysed. [24]

Model: **usage/credit-based** (you buy credits and pay per call-minute and per SMS segment), not per-seat. International pricing differs (separate page). [24][8]

## 10. Strengths & gaps

**Strengths** [25][1][4]
- True multi-channel on one contact list (calling + P2P texting + broadcast + email) – rare.
- Mature **P2P inbox**: Pending/Chats split, Fast P2P, queue auto-distribution, saved replies, opt-out hygiene, 10DLC handled.
- Genuine **automation engine** (Workflows) with real triggers/conditions/actions and a visual builder – a working journeys model.
- Deep **CRM integrations** (NGP VAN, NationBuilder, PDI, Salesforce, Action Network, Blackbaud) with survey/disposition write-back.
- Usage-based pricing, unlimited agents, low entry cost.

**Gaps** [3][11][25]
- **No native door-knock canvassing** – no walk lists, turf/maps, GPS, offline field capture; field requires Ecanvasser.
- Scripts/surveys are **per-channel**, not one reusable object across calling/texting/(door); cross-channel continuity is CRM/Workflow-mediated.
- Reviewer complaints: UI gets **clunky at scale**; limited ability to record/amend call outcomes; **no way to navigate back to a previous contact** after advancing; trouble accessing prior caller notes; voicemail delays; credits can expire during inactivity.
- US-centric compliance/integration stack; less turnkey outside US/CA.

## 11. What uprise should borrow / avoid

**Borrow:**
1. **The P2P inbox split (Pending vs Chats) + Fast P2P.** Sending all first-touches in bulk and concentrating agent attention only on replies is the right ergonomic for volunteer texters. Mirror it. [1][17]
2. **Auto queue distribution with no double-messaging.** Server-owned queue assignment so two agents never collide on one contact – essential and uprise already lives in this space. [1]
3. **Tags as the universal currency.** CallHub uses tags as the join between channels: tags are triggers, branch conditions, and segment definitions. For uprise this is the cleanest way to let a door outcome drive a text journey and vice-versa. [4]
4. **The Workflows trigger/condition/action vocabulary.** Adopt a similar explicit set: triggers (message received, outreach completed, tag added, link clicked), wait conditions (min/hr/day), if/else on disposition/survey-response/tag, actions (add to campaign/list, add/remove tag, webhook). It's a proven, legible journeys grammar. [4]
5. **Saved replies with merge tags + tracked links inside the inbox.** Canned responses that personalise and measure – directly applicable. [1]
6. **CRM write-back of every disposition and survey answer in real time.** [4]

**Avoid / beat:**
1. **Don't let canvassing be a bolt-on.** CallHub's biggest miss is that doors aren't a native channel, so there's no door disposition, no door trigger, and no shared timeline – field is a separate synced product. uprise' whole thesis (door coupled to the texting inbox around a shared contact) is exactly the gap CallHub leaves open. Make the **shared contact timeline across door + text** first-class, not a CRM sync. [3][11]
2. **Don't fragment scripts per channel.** Build **one canonical script/survey object** that drives canned responses in BOTH the door and text interfaces (uprise' stated goal). CallHub's per-channel scripts force duplication and break continuity. [19][1]
3. **Design a proper door-knock disposition taxonomy** CallHub lacks: Not Home, Moved/Gone Away, Refused, Wrong Address, Spoke-to-target, Not Target, Come Back Later – and make those dispositions usable as journey triggers, the same way CallHub uses call dispositions. [22][8]
4. **Fix the back-navigation and editable-outcome complaints.** Let agents revisit a previous contact and amend a disposition/notes; CallHub reviewers specifically flag the inability to do this. [25]
5. **Keep the inbox snappy at scale** – the recurring "clunky at high volume" critique is a quality bar to clear. [25]

## 12. Sources

- [1] CallHub – Peer-to-Peer Texting: https://callhub.io/platform/peer-to-peer-texting/
- [2] CallHub – homepage / unified platform: https://callhub.io/
- [3] CallHub – iOS/Android app: https://callhub.io/platform/ios-android-app/
- [4] CallHub – Workflows and Automation: https://callhub.io/platform/workflow-automation/
- [5] CallHub – Nonprofit & Advocacy / industries: https://callhub.io/industries/nonprofit/
- [6] CallHub – Political industry page: https://callhub.io/industries/political/
- [7] CallHub – company/use-case positioning (search synthesis of industry pages): https://callhub.io/industries/political/
- [8] CallHub – International pricing: https://callhub.io/pricing-international/
- [9] CallHub – Phone banking software: https://callhub.io/platform/phone-banking/
- [10] CallHub – Call center software: https://callhub.io/platform/call-center-software/
- [11] Ecanvasser – CallHub integration (field canvassing): https://www.ecanvasser.com/integrations/callhub
- [12] CallHub blog – 17 Best Canvassing Software: https://callhub.io/blog/canvassing/canvassing-software/
- [13] CallHub support – Call Dispositions in CallHub: https://support.callhub.io/hc/en-us/articles/900001358306-Call-Dispositions-in-CallHub
- [14] CallHub support – DNC / Do not Contact: https://support.callhub.io/hc/en-us/articles/900001359443-DNC-Do-not-Contact
- [15] CallHub – NationBuilder integration / survey sync: https://nationbuilder.com/callhubpeertopeertexting
- [16] CallHub developer docs: https://developer.callhub.io/page/frequently-asked-questions
- [17] CallHub support – Peer-to-Peer Texting Reports (Pending/Chats): https://support.callhub.io/hc/en-us/articles/900001359863-Peer-to-Peer-Texting-Reports
- [18] CallHub blog – What is Peer-to-Peer Texting (survey question types): https://callhub.io/blog/text-messaging/peer-to-peer-texting/
- [19] CallHub – Branching Scripts: https://callhub.io/platform/branching-scripts/
- [20] CallHub support – Call Center campaign overview: https://support.callhub.io/hc/en-us/articles/900001358846-Call-Center-Campaign-overview
- [21] CallHub support – Workflow 2.0 use cases: https://support.callhub.io/hc/en-us/articles/18909837763481-What-are-the-available-use-cases-for-Workflow-2-0
- [22] Extinction Rebellion Rebel Toolkit – Guide to using CallHub (disposition list): https://rebeltoolkit.extinctionrebellion.uk/books/rebel-ringers-handbook/page/guide-to-using-callhub
- [23] CallHub support – Peer-to-Peer / call reports buckets: https://support.callhub.io/hc/en-us/articles/900001359863-Peer-to-Peer-Texting-Reports
- [24] CallHub – Pricing US & CA: https://callhub.io/pricing/
- [25] Capterra – CallHub reviews (pros/cons): https://www.capterra.com/p/149279/CallHub/reviews/
