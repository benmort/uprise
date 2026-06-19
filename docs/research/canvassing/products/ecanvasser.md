# Ecanvasser – Product Dossier

Research date: 2026-06-16. Sources are primary (ecanvasser.com, support.ecanvasser.com, pricing) plus secondary reviews (Capterra, GetApp). Inline citations [n] map to the Sources list.

> Note on scope drift: Ecanvasser has repositioned over the last few years from "political/community canvassing software" toward "field sales software for predictable growth" [9]. The current `.com` marketing site leads with field sales (solar, broadband, home improvement) while the older `web.ecanvasser.com` site and much of the support knowledge base still reflect the political/advocacy heritage [12][1]. Both audiences run on the same product. This dossier treats them as one platform.

---

## 1. Positioning

- **Who it's for.** Door-to-door field teams of two kinds: (a) political campaigns, advocacy groups and nonprofits doing voter contact and grassroots organising; (b) commercial field sales (solar, broadband, home improvement, pest control) doing residential lead generation [1][9][12]. The product is the same; only the marketing language differs.
- **Origin & scale.** Founded ~2014 in Cork, Ireland by Brendan Finucane; grew out of political canvassing [1]. Marketing claims ~200,000 organisers across ~70 countries and 3,000+ political/advocacy campaigns historically [1][12].
- **Geography.** Global, country-agnostic by design (addresses are flexibly structured rather than locked to one national format). Mobile apps localised in 13–15 languages [1][13].
- **Advocacy vs electoral.** Both, plus commercial. It is a **canvassing-first field operations tool**, not a CRM, not a campaign comms suite, and not a voter file/VAN-style data product [4][3]. Reviewers explicitly note it lacks voter-ID append and phone-banking that electoral specialists (NGP VAN) provide [3].

---

## 2. Full product scope

Feature inventory from the current features page and product page [4][3]:

**Field operations**
- Configurable field sales / canvassing mobile app (white-labellable) [4]
- Real-time field tracking (GPS, live activity monitoring) – Pro tier and up [4][14]
- Route planning (optimised walking/driving routes) [4]
- Offline canvassing with later sync [4]
- Territory management / turf cutting (draw, split, assign; shapefiles) [4][1]
- Appointment scheduler for follow-ups [4]
- Time-bound lists (auto-control when reps can access a list/territory) [4]
- Apartments & buildings tools for high-density / multi-unit canvassing [4]
- Verified household data / "Lead Prospector" (US only, paid add-on) – homeowner status, income, demographics [4][6]

**Data & insights**
- Contact database with Contacts / Houses / Streets / Lists / Locations views [10]
- Custom fields (text and multiple-choice) [22][10]
- Dynamic and static lists (smart lists that auto-update hourly) [3][20]
- Dashboards & reports (interactions, productivity, leads) [3][11]
- Scoreboards / leaderboards (team performance) [4]
- Duplicate detection / merge-conflict handling [18]
- Import (contacts+addresses / contacts-only / addresses-only) and export [21][16]

**Engagement tools at the door**
- Surveys (drag-and-drop builder, 5 question types) [5][6]
- Talking points / scripts ("talking points" standardisation) [4]
- E-signature capture [4][5]
- Notes on contacts [4]
- Push notifications to field teams and (per older material) to supporters [4][8]

**Platform / admin**
- Custom branding / white-label [14]
- Team & user permission settings [17]
- Two-factor authentication [4]
- Data privacy / GDPR toolkit [4]
- Public API; pre-built integrations (Salesforce, HubSpot, NationBuilder, Mailchimp, CallHub; "5,000+ via integration layer") [1][4]
- Multi-account workspace + developer sandbox (Enterprise) [14]

**Notably absent (confirmed):** native SMS/text sending, native email broadcast, in-app phone banking/dialler, and any constituent-facing inbox. These are delivered only via integrations (see §5) [4][3][2].

---

## 3. Canvassing / door-knock UX

This is the product's core and its strongest area.

**Map & territory UX.** Managers use visual map tools to draw, split and assign territories ("turf cutting"), explicitly to eliminate overlap and missed addresses [1]. Live interactive maps show team positions and territory progress in real time [1][14]. Supports shapefile import for predefined boundaries (precincts, districts) [1]. Reviewers report map accuracy issues on some devices (see §10) [3].

**Household / address model at the door.** The canvasser works an address list; the data is structured houses-first, with multiple contacts attached to a house (see §4). The app supports **apartments & buildings** as a distinct workflow for multi-unit / high-density stacks [4]. Verified household data (US) can pre-filter doors by homeowner status / income before assignment [4][6].

**Turf assignment / canvasser management.**
- Lists/territories are assigned to specific teams or individual users [10][20].
- **Static lists support auto-split and assign** (carve a big list into per-canvasser chunks); **dynamic lists do not** auto-split [20]. This is an important operational nuance.
- **Time-bound lists** automatically open/close access to a list by schedule [4].
- Managers monitor exactly where canvassers are working via GPS-verified activity; leaderboards/scoreboards rank individuals and teams [4][14].

**Route planning.** Auto-generates efficient walking/driving routes with multiple stops to reduce travel time and increase doors-per-hour [4][1].

**Offline.** The mobile app works fully offline; interactions, survey responses, signatures and notes are captured on-device and sync to the dashboard when connectivity returns [4][5]. Caveat: dynamic lists refresh hourly and mobile views only reflect updates after a refresh – a known footgun when multiple teams work the same area [20].

**At the door, the canvasser can record:** an interaction status/disposition (customisable), a 1–5 star rating (team-defined meaning), survey responses, talking-point updates, notes, digital consent / e-signature [22]. The app is configured centrally and previewed via an "App Preview" tool before publishing; what each canvasser sees is governed by permission settings [22][17].

**Mobile app.** Historically marketed as the "Walk App" / "Go App"; current site calls it simply the configurable field sales app [1][4]. iOS and Android.

---

## 4. Data model

**Houses-first, contacts attached.** Imports come in three shapes: Contacts-with-addresses (occupants tied to a household address), Contacts-only, and Addresses-only [21]. The database can be viewed as **Contacts / Houses / Streets / Lists / Locations** [10]. You can create a house and then add contacts to that property [10].

Important subtlety: there is **no rigid first-class "household" entity** with its own attributes – grouping is done by **address matching**. Multiple people at one address are separate contact records distinguished by **first + surname** (both compulsory), sharing the same address [22][21]. So "household" is effectively "contacts that share an address," not a parent object you attach household-level survey answers to. (A review complaint is the lack of true household-level question selection [3].)

**Addresses.** Broken into at least three mandatory sections – Street Name, City/Town, State/County – with optional unit type/number, house number, zip, precinct name/number, street type/direction [22]. Deliberately flexible to accommodate any country's file format [22].

**Standard contact fields.** Contact ID, first/surname, gender, DOB, address fields, volunteer status, deceased flag, party affiliation, election history [22]. **Custom fields** (text or multiple-choice) extend this; a text field changed to multiple-choice auto-generates options from imported values [22].

**Interactions.** Each interaction has an outcome **status/disposition** (fully customisable, see §8), optional 1–5 rating, notes, and is logged against the contact across channels (door, phone, email, face-to-face) [22][11]. The database tracks whether a contact "has been interacted with or surveyed" as filterable state [10].

**Survey responses.** Sync back to the central database and are **linked to individual contact records**; filterable/exportable per survey [5][6]. (Linked to the contact, not to a separate household object.)

**Lists.** Dynamic (auto-update hourly on locked filter criteria – support status, custom tags, geography, prior interactions) or Static (manual snapshot) [3][20]. Lists drive assignment and follow-up management [10].

**Storage / sync.** Cloud-hosted; mobile captures offline and syncs to the dashboard; dynamic lists/mobile views refresh hourly or on manual pull [4][20]. GDPR/data-privacy toolkit, 2FA, granular permissions [4][17].

---

## 5. P2P texting / inbox

**There is no native P2P texting, bulk SMS, broadcast email, or messaging inbox inside Ecanvasser.** Confirmed against the features page, product page and reviews – none mention SMS/email sending [4][3][2].

What exists:
- **Push notifications** to field teams (and, per older marketing, to supporters' phones to drive action) [4][8].
- **A "follow-up" workflow that resembles a lightweight helpdesk, not a texting inbox.** Field-logged follow-up requests flow in real time to the office, where staff handle them, **respond via email**, assign to team members, add internal notes, and set conversations Open / Snoozed / Closed [3]. This is case triage, not a P2P SMS conversation surface.
- **All real messaging is integration-delivered, primarily via CallHub** [2]. The CallHub integration syncs Ecanvasser contact lists into CallHub and then enables: phone dialler campaigns, **peer-to-peer texting** (1:1 at scale), **broadcast SMS** (personalised bulk), and SMS follow-up when a call fails [2]. The intended pattern: canvass the door in Ecanvasser → push those contacts to CallHub → continue the relationship by phone/text [2].
- Email broadcast is reached via NationBuilder/Mailchimp integrations, not natively [8][1].

**Relevance to yarns:** Ecanvasser is the inverse of yarns. yarns is texting-first adding doors; Ecanvasser is doors-first and *outsources* texting. The "doors → P2P text follow-up" hand-off that Ecanvasser only achieves by bolting on CallHub is exactly the coupling yarns can own natively. The Open/Snoozed/Closed follow-up triage is a useful precedent for an inbox state model.

---

## 6. Survey & script tooling

**Surveys.**
- Built in the dashboard with a **drag-and-drop form builder** [5][6].
- **Five question types:** Multiple Choice, Yes/No, Text (open), 5-point scale (Strongly Agree → Strongly Disagree), Checklist [6].
- **Publish gate:** new surveys default to *Unpublished* and only appear in the app once published, giving time to draft and review [6]. Approval control keeps field messaging consistent [5].
- **Team scoping:** assign a survey to specific team(s); leave the team field blank to make it available to all members [6].
- **Offline capture**, responses sync back and **link to individual contact records**; analytics filter by Campaign Effort and app type; export per survey [5][6].
- **E-signature** can be attached to convert verbal support into a verified sign-up [5].

**Scripts / talking points.** Delivered as a **"Talking Points"** feature for script standardisation – canvassers see approved talking points in the app, and can update them as part of an interaction [4][22]. This is content shown to the canvasser; it is *not* described as a branching script that triggers different canned answers based on contact response.

**Reusability across channels.** **Weak.** Surveys and talking points live inside Ecanvasser's door app. Because texting happens in a *separate* tool (CallHub), there is **no shared script/survey object that drives canned responses in both a door interface and a text inbox**. This is precisely the cross-channel reuse yarns intends to build and that Ecanvasser does *not* have.

---

## 7. Journeys / engagement ladders

**No true journey/sequence engine.** No drip campaigns, no multi-step triggered email/SMS sequences, no automated engagement ladder [3][4].

The closest analogues:
- **Dynamic smart lists** – auto-update hourly as contacts match/stop matching locked filter criteria (support status, tags, geography, prior interactions). They act as a *segmentation* primitive other actions hang off, not a sequence [3][20].
- **Outcome-triggered follow-up** – interaction outcomes can be used to trigger follow-ups, assign next steps, or feed re-engagement lists; "Follow-up required" spikes flag re-engagement opportunities [11][3].
- **Appointment scheduler** and **time-bound lists** automate *when* a door or list is worked, not a contact's nurture path [4].
- **Engagement targeting / retargeting** docs describe re-contacting people by prior engagement (e.g. re-canvass "Not Home", email those not reached) – manual/list-driven, not an automated journey [11].

**Net:** the building blocks (segmentation + outcome triggers) exist; the orchestration layer (a defined multi-step journey a contact progresses through) does not.

---

## 8. Disposition / outcome taxonomy

Dispositions are **"Interaction Statuses": fully customisable**, with team-defined descriptions, plus an optional **1–5 star rating** whose meaning each team sets [22]. There is no fixed canonical code set shipped as immutable.

Default/example outcome codes seen in support and reporting docs [11][22]:
- **Interested**
- **Declined**
- **Not Home**
- **Follow-up required** (callback / re-contact)

Common extensions teams layer on: support level and issue category, applied via **custom field tags** on top of the interaction rather than as additional status codes [11]. Outcomes feed conversion-rate calculations and can build Dynamic Smart Lists for follow-up [11][22].

**Takeaway for yarns:** Ecanvasser treats disposition as *configurable per org* (a small default set + custom statuses + a rating axis + tag layering), rather than a hard-coded taxonomy. That flexibility is worth copying, but note the cost: customisable-everything makes cross-org benchmarking and shared scripts harder.

---

## 9. Pricing & access model

Pricing is **by database contact volume, with unlimited users/seats** – no per-seat fees [4][14][6]. Tiers as published [14]:

| Plan | Price | Contact DB | Notable inclusions |
|---|---|---|---|
| **Core** | $99/mo | 2,500–50,000 | Custom app, territory mapping, route planning, interaction tracking, analytics, appointment scheduling, integrations |
| **Pro** | $599/mo | 100,000–250,000 | Everything in Core + real-time field tracking + API access; lead prospecting +$99/mo (US) |
| **Enterprise** | from $10,500/yr (12-mo min) | custom | Pro + multi-account workspace, developer sandbox, custom branding, dedicated account manager, enhanced support |
| **Field Sales Starter Bundle** | $2,700/yr (1-yr) | 100,000 uploadable | Essential canvassing + real-time tracking + lead prospecting included |

- **Free trial:** 7 days, one per customer [14].
- **No setup fee** via online self-serve signup [12].
- **Lead Prospector** (verified US household data) is a paid add-on (+$99/mo) [6][14].
- Capterra lists overall rating **4.0/5** (~93 reviews); GetApp/Software Advice carry similar profiles [3].
- Secondary listings sometimes quote €99/€599 (Euro origin) – treat USD figures from the current pricing page as authoritative [3][14].

The unlimited-users + volume-based model is field-team friendly: you can deploy hundreds of volunteers without seat cost, and pay for the size of your universe.

---

## 10. Strengths & gaps

**Strengths**
- Strong, purpose-built **door-knock map/turf UX**: draw/split/assign turf, shapefiles, live team positions, route optimisation [1][4].
- **Genuinely offline** field app with on-device capture and sync [4][5].
- **Flexible, country-agnostic address model** + houses-first views (Contacts/Houses/Streets/Lists/Locations) [10][22].
- **Configurable everything**: custom interaction statuses, custom fields, white-label app, team-scoped surveys and talking points [22][14].
- **Unlimited-seat pricing** – scales to large volunteer/rep teams without per-user cost [14].
- **Dynamic smart lists** + outcome-driven follow-up as a clean segmentation primitive [20][11].
- Broad **integrations + public API** for stitching into a wider stack [1][4].

**Gaps**
- **No native messaging at all** – no SMS, no broadcast email, no P2P texting, no real inbox; all outsourced to CallHub/NationBuilder [4][2][8].
- **No journey/sequence engine** – only lists + manual/outcome-triggered follow-up [3][7].
- **No true household object** – "household" is address-grouping, so no household-level survey questions (a stated reviewer pain) [22][3].
- **Mobile reliability complaints** – crashes/freezes/map inaccuracy on some/older devices, iOS/Android drift [3].
- **No voter-ID append / phone banking** natively – weak for serious electoral data ops vs NGP VAN [3].
- **Scripts are static talking points**, not response-driven branching/canned answers [4].
- **Cross-channel script reuse is absent** – door tooling and text tooling live in different products [2][5].
- Support inconsistency (slow weekends, training/billing friction) reported by reviewers [3].

---

## 11. What yarns should borrow / avoid

**Borrow**
1. **Turf/list assignment primitives.** Adopt static-vs-dynamic lists, and especially **auto-split-and-assign** for carving a universe into per-canvasser chunks – plus **time-bound lists** to open/close turf on schedule [20][4]. yarns can apply the same list primitive to *both* a walk list and a texting send list.
2. **Houses-first, multi-contact-per-address model – but go further.** Ecanvasser's address-grouping is useful, but its lack of a real household object is a stated weakness. yarns should ship a **first-class household entity** so household-level survey answers ("how many voters here?", "yard sign?") and per-person answers can coexist [22][3].
3. **Publish gate + team scoping for surveys/scripts.** Unpublished-by-default with an approval step, and team-scoped assignment, are good guardrails for volunteer-facing content [6][5].
4. **Configurable disposition model:** small sensible default set (Interested / Declined / Not Home / Follow-up) + custom statuses + a rating axis + tag layering [22][11]. Ship sane defaults so cross-org reporting still works.
5. **Outcome-triggered follow-up + the Open/Snoozed/Closed conversation state.** Map field/text outcomes straight into yarns' inbox states; "Follow-up required" should drop a contact into the right journey/list automatically [3][11].
6. **Offline-first capture with explicit sync semantics**, and surface the staleness clearly – Ecanvasser's hourly-refresh footgun (two teams hit the same door) is a warning to make assignment locks real-time, not eventually-consistent [4][20].
7. **Unlimited-seat, volume-based pricing** fits volunteer-heavy organising; per-seat would throttle adoption [14].

**Avoid / beat**
1. **The biggest opportunity: do natively what Ecanvasser bolts on.** Ecanvasser only reaches "knock the door → text the follow-up" by exporting to CallHub. yarns should make **the door interaction and the P2P text thread two views of one contact timeline**, no export [2].
2. **Don't ship static talking points only.** Build **response-driven scripts/surveys whose answers fire canned responses in BOTH the door UI and the text inbox** – the shared script/survey object Ecanvasser lacks is yarns' core differentiator [4][5][2].
3. **Don't stop at lists for "journeys."** Lists + manual follow-up is not a journey. yarns should ship a real **multi-step engagement sequence** (e.g. door not-home → text → re-knock → text reminder) that a contact progresses through automatically [7][3].
4. **Don't let "configurable everything" kill shared scripts.** Ecanvasser's fully-custom statuses fragment reporting and prevent reusable scripts. Keep a strong shared default taxonomy so scripts and benchmarks travel across orgs [22].
5. **Don't underinvest in mobile stability/map accuracy** – the recurring complaint that undercuts an otherwise good product [3].

---

## 12. Sources

- [1] https://www.ecanvasser.com/ (and search-derived overview) – platform overview, founder, scale, turf/maps
- [2] https://callhub.io/integrations/ecanvasser/ – CallHub P2P texting, broadcast SMS, phone, follow-up workflow
- [3] https://www.capterra.com/p/156872/Ecanvasser/ – 4.0/5 rating, pros/cons, gaps (no SMS, no household questions, mobile crashes, no voter-ID)
- [4] https://www.ecanvasser.com/features – full feature list; confirms no native SMS/email
- [5] https://www.ecanvasser.com/feature/surveys – survey builder, offline, contact linking, e-signature
- [6] https://support.ecanvasser.com/en/articles/1017071-surveys – 5 question types, publish gate, team scoping
- [7] https://www.ecanvasser.com/product – modules; absence of automated nurture/sequences
- [8] http://web.ecanvasser.com/resources/integrations.html – NationBuilder/Mailchimp email, push notifications
- [9] https://www.ecanvasser.com/canvassing – field-sales repositioning, canvassing detail
- [10] https://support.ecanvasser.com/en/articles/1003509-understanding-your-contact-database – Contacts/Houses/Streets/Lists/Locations views
- [11] https://support.ecanvasser.com/en/articles/11137798-how-to-use-interaction-reports – outcome codes (Interested/Declined/Not Home/Follow-up), tags, smart lists
- [12] http://web.ecanvasser.com/ and /pricing.html – political/advocacy heritage, no setup fee
- [13] (search-derived) Ecanvasser languages (13–15) and global use
- [14] https://www.ecanvasser.com/pricing – tiers, contact-volume pricing, unlimited seats, trial
- [16] https://support.ecanvasser.com/en/articles/1001109-importing-a-contact-file-into-ecanvasser – import types
- [17] https://support.ecanvasser.com/en/articles/5099952-permission-settings – permissions
- [18] https://support.ecanvasser.com/en/articles/1330354-merging-data-conflicts – duplicate/merge handling
- [20] https://support.ecanvasser.com/en/articles/5894218-dynamic-or-static-lists – dynamic vs static, hourly refresh, auto-split (static only)
- [21] (search-derived) https://support.ecanvasser.com/en/articles/1043720-understanding-your-contact-file – import shapes, houses-first
- [22] https://support.ecanvasser.com/en/articles/2721045-building-your-customized-canvassing-app + /1043720 – custom statuses, ratings, address sections, standard fields
