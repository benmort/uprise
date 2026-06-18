# Reach (reach.vote) – product dossier

Research date: 2026-06-16. Subject: **Reach**, the relational organising and canvassing app at reach.vote (also "getreach"), built originally out of Alexandria Ocasio-Cortez's 2018 campaign. [1][3] This is the correct Reach – relational voter contact and community canvassing for progressive campaigns – not "REACH Business Cloud", an unrelated customer-experience/eSignature product that appears on some software directories. [12]

---

## 1. Positioning

Reach pitches itself as a "grassroots organising app" that meets people "where they are" – in person, on their phones, and in online communities – rather than relying solely on a static voter file. [3] It explicitly positions as a **supplement to, not a replacement for, traditional door-knock/walk-list tools** (MiniVAN, Polis, Ecanvasser, PDI). [2]

- **Who it's for:** electoral campaigns (presidential, congressional, local), nonprofits, activist groups, labour unions, and community organisations. [3] Tool access is gated: "Reach is built by progressives, for progressives", and you must either bring your own voter data or buy it through Reach's relationships with state parties and progressive vendors. [4]
- **Geography:** US only. Testimonials, case studies and the voter-file matching all assume US voter data; the company address is in New York. [3] Australian use would be a poor fit – the entire data model assumes a US voter file (party registration, districts, voting history). Marked **Unknown – not found** for any non-US deployment.
- **Electoral vs advocacy:** both. Marketing serves "electoral campaigns" and "non-profits & activist groups" doing civic engagement equally. [3] The flat (non-per-user, non-per-response) pricing model is designed to let volunteer programs scale without metering. [4]

The core thesis: turn **every** voter interaction – planned or chance – into a logged canvassing attempt, and let each volunteer activate their **own** personal network rather than only working assigned turf. [1][3]

---

## 2. Full product scope

- **Community canvassing / direct search** – search the voter database for anyone you meet, ID them, capture support status, collect contact info, record survey responses, apply tags. [1][3]
- **Relational organising** – import phone contacts, match them to the voter file (human-verified), build a personal Network, run friend-to-friend outreach. [11][3]
- **Voter registration pipelines** – "choose your own adventure" registration flows with chase steps; newly registered voters convert into relational contacts. [1][3]
- **Action Cards** – an admin-pushed task/CTA system on the app Home Screen (seven CTA types, see §7). [9]
- **Contact Scripts** – reusable pre-written SMS and email scripts with templating. [6]
- **Survey questions / Question Library** – six question types, reusable Question Sets, one designated "Primary Question". [10][person screen 8]
- **Tags & Smart Tags** – manual, source, user-created, and auto-applied tags. [tags 7]
- **Digital organising hub** – home screen, live chat, user groups, push notifications, leaderboards, gamification. [3][app 6]
- **Content library** – shareable images/videos/links for volunteers to push to social. [3]
- **Integrations & data out** – real-time two-way VAN sync, plus EveryAction/NationBuilder-shaped exports, webhooks, scheduled CSV exports, BigQuery mirror (top tier). [van 8][export 8][4]
- **Native iOS + Android apps and a web interface**; offline support; multilingual with the ability to override voter-file data including dead-names. [app 6][3]

---

## 3. Canvassing / door-knock UX

Reach's canvassing is **search-first, not turf-first**. The volunteer searches for the person they're standing in front of (search handles nicknames – "Jake" finds "Jacob"), opens the Person Screen, and logs the interaction. [11][person 8] This is built for **flexible canvassing** where walk lists fail: street-corner tabling, farmers' markets, "canvassing your Uber driver". [2]

- **No map view, no turf-cutting, no pre-cut walk lists.** Reach's own comparison page concedes traditional apps win on these. [2] To door-knock with Reach alone you search by individual address or street and filter results by address to assemble an ad-hoc list. [2]
- **Recommended pattern:** run Reach *alongside* MiniVAN/Polis/etc. – work the walk list in the other app, switch to Reach for anyone not on the list. [2]
- **Surveys at the door** are the Person Screen Survey tab: the Primary Question's answer colour-codes the top of the screen for instant visual support status; additional Question Sets sit below. [person 8]
- **Dispositions are not native** – there is no built-in "Not Home / Refused / Moved" disposition picker. The guidance is to **build dispositions yourself as custom survey questions** ("Not Home", "Hostile", language barrier). [2] Canvass-result dispositions only formally exist via VAN mapping (see §8).
- **Mobile app:** native iOS/Android, offline-capable, with image attachments on messages. [app 6] Rated 4.4/5 from 65 ratings on the App Store; users praise canvassing "anyone anywhere", a few criticise content/tone. [app 6]

---

## 4. Data model

The atomic unit is the **Person**, surfaced via the **Person Screen** (the contact hub for recording everything). [person 8] Key fields:

- **Identity / contact info:** name, phone numbers, email addresses (each with opt-out status), Reach ID, external IDs. [export 8][person 8]
- **Address / geo:** address plus household members; editable; no map/lat-long canvassing surface exposed. [person 8]
- **Voter detail:** registration status, party, district, voting history. [person 8]
- **Survey responses:** answers to Question Sets; one Primary Question colour-codes the record. [person 8]
- **Tags:** source / manual / user-created / smart (see §8). [tags 7]
- **Relationships:** Network membership with customisable Relationship Types; "Last Reached" timestamp resets on any survey response or contact action. [11][person 8]

**Storage / sync.** Reach is cloud-hosted with a real-time, two-way VAN integration:

- Survey responses map to VAN **survey responses, activist codes, or canvass results**; long/short text becomes VAN notes. [van 8]
- Contact actions (message/email/call/marked-reached) sync, but **throttled to one contact-history entry per hour per voter** (VAN API limit). [van 8]
- **My Voters** syncs to imported records; **My Campaign** receives "Reach Adds" (newly created people) with name/address/phone/email and matches them. [van 8]
- **Does not sync:** phone/text contact *types* (privacy), Reach tags, network relationships, bulk imports; voter-file phone/email isn't written back. [van 8]
- Export surface is broad: 16 export types including People, Responses (VAN/EveryAction/NationBuilder-ready), Response List, Tag History (log of every add/remove with timestamp+user), Tag State, Contact Actions (incl. script used + device), Pipeline Instances/Transitions, Content Actions. [export 8] Webhooks and BigQuery mirror available on the top tier. [4]

---

## 5. P2P texting / inbox

This is Reach's biggest divergence from a P2P SMS platform like yarns. **Reach has no shared texting inbox and no platform-mediated conversation thread.** [10 marketing]

- Texting is a **Contact Action**: the volunteer picks a Contact Script, taps "Use this Script", and Reach **launches the device's own SMS or email app with the message pre-filled**. The message "comes directly from the user's own phone number or email address." [6][11]
- Reach therefore **logs the *attempt*** (which script, when, what channel) but **does not capture the reply**. There is no inbound message store, no conversation model, no two-way thread inside Reach. [6][export 8]
- Reach itself says its one-to-one texting/emailing is "very basic" and "not designed to meet the full texting needs of a modern campaign". [intro search]
- **How texting relates to canvassing:** both are just **Contact Actions logged against the same Person**. A volunteer can door-knock a contact, then later text them, and both update the same "Last Reached" clock and contact history on one Person record. [11][person 8] That shared-contact coupling is the genuinely useful idea (see §11) – but it stops at *logging*, because the actual conversation lives in the volunteer's native phone apps, not in Reach.

---

## 6. Survey & script tooling

Reusable, admin-built, and shared across both the door and the (device-launched) text/email channel.

- **Six survey question types:** Numerical Scale, Single Choice, Multiple Choice, Short Text, Long Text, Yes/No. [10] Questions live in a **Question Library** and group into **Question Sets**; one question per campaign is the **Primary Question**. [survey 8][person 8]
- **Contact Scripts:** admin creates multiple active SMS and email scripts; volunteers pick from a list per contact action. [6] Scripts support **templating** (person's name, user's name, basic profile fields) and **image attachments** (JPG/PNG/GIF). Email scripts add a subject line. [6]
- **Reusability across channels:** the *same survey questions* serve community canvassing, relational outreach, and User Surveys delivered via Action Cards – one Question Set, many surfaces. [9][survey 8] Scripts are channel-specific (separate Email vs Messaging tabs) but the script *content* is authored once and reused by all volunteers. [6] This is the closest analogue to yarns' "shareable script/survey that drives canned responses in both door and text interfaces" – Reach gets the *shared authoring* right but doesn't surface scripts as *canned responses to an inbound reply*, because there's no inbox.

---

## 7. Journeys / engagement ladders

Reach has **no true sequence/journey engine** – no time-based, multi-step, auto-advancing flows. What it has instead is admin-orchestrated nudging:

- **Action Cards** are the primary engagement-ladder mechanism: admin publishes cards to the Home Screen with seven CTA types – Content Share, Internal link, External link, File Upload, Content Upload, User Survey, and **Reach Network Contact** (share a custom script to your network via SMS/email/call). [9]
- **Targeting + ordering** simulate a ladder: cards target by role, user group, state, zip, verified-email status; Pin and Priority control stacking/visibility; expiration dates auto-remove cards after an event. [9] This lets admins surface different asks to different segments – "conditional workflows without confusion" – but it's manual curation, not automation. [9]
- **Push notifications** fire once, at publish time, per card; **there is no scheduling of notifications for later**. [9]
- **Follow-ups** are achieved by admins prompting users to send specific follow-ups across the cycle, or adding new survey questions at milestones – again, human-triggered, not automated. [11]

Net: engagement laddering in Reach = "publish the next Action Card to the right segment", not "contact enters a sequence and auto-progresses".

---

## 8. Disposition / tag taxonomy

Reach has **no fixed, native disposition taxonomy.** Outcomes are expressed two ways:

**Tags** – four kinds: [tags 7]
- **Source Tags** – applied by Reach (e.g. "Voter" vs "Reach Add").
- **Manual Tags** – added/removed by users or API; can be admin-locked.
- **User-Created Tags** – an individual volunteer's private tags (shown purple; only creator + admins see them).
- **Smart Tags** – auto-applied from voter data (district, party, voting history); cannot be manually removed.
Tags are fully campaign-defined; documented examples are organising states like "Volunteer", "Member", "Donor", "Petition Signer". [tags 7] Display is capped (first two tags by numeric Priority show in list views). [tags 7] Tag changes are fully audited via the Tag History export. [export 8]

**Canvass-result dispositions** – not a first-class app object. The two routes:
1. **Custom survey questions** standing in for dispositions: "Not Home", "Hostile", language barrier. [2]
2. **VAN mapping** – Reach survey responses can map to VAN **canvass results**, with documented examples "Not Home" and "Moved" syncing to VAN's canvass-results field. [van 8]

So a yarns-style canonical disposition list (e.g. Answered / No Answer / Not Home / Refused / Wrong Number / Moved / Deceased / Do Not Contact) **does not ship out of the box** – each campaign reinvents it as questions/tags.

---

## 9. Pricing & access model

- **Cost model:** flat **monthly fee per organisation – no per-user and no per-response charges; unlimited users on every tier.** Month-to-month, cancel/switch anytime after month one. [4][intro search] Exact dollar figures aren't published; pricing is generated dynamically after you pick org type and size. [4]
- **Three tiers + enterprise:** [4]
  - **Basics** – 1 campaign, 3 custom tags, 3 integrations, 1 offline dataset, 1 custom survey question, 3 email/SMS scripts.
  - **Complete** – unlimited campaigns, 30 custom tags, unlimited integrations, 3 offline datasets, unlimited survey questions, unlimited scripts.
  - **Movement** – unlimited everything; adds **API access, automated exports, BigQuery mirror**, and 3 Reach campaigns.
  - **Enterprise** – custom.
- **All tiers** include support and unlimited Reach Adds + voter registration. [4]
- **Access gating:** progressive-only; you supply voter data or buy it via Reach's vendor/state-party relationships. [4]
- **Payment:** card, debit, ACH; auto-pay; monthly invoices. [4]

---

## 10. Strengths & gaps

**Strengths**
- **Search-first canvassing** that captures chance encounters traditional walk-list apps drop entirely. [2]
- **Human-verified contact-to-voter matching** (volunteer confirms, not an algorithm) – higher-quality matches and volunteers see who they know. [11]
- **One Person record unifies every channel** – door, call, text, email all log to the same contact and "Last Reached" clock. [11][person 8]
- **Reusable Question Sets and Contact Scripts** authored once, used by all volunteers across surfaces. [6][survey 8]
- **Flat unlimited-user pricing** removes the disincentive to onboard large volunteer pools. [4]
- **Real-time two-way VAN sync** with granular export taxonomy and full tag-change audit log. [van 8][export 8]

**Gaps**
- **No map / turf-cutting / walk lists** – cannot stand alone for systematic door-to-door. [2]
- **No real texting inbox or conversation model** – texting hands off to the device's SMS app; replies are never captured. [6]
- **No native disposition taxonomy** – campaigns rebuild outcomes as ad-hoc questions/tags. [2]
- **No automated journeys/sequences** – engagement is manual Action-Card publishing; push notifications can't be scheduled. [9]
- **US-only and progressive-gated** – not usable outside the US voter-file world. [3][4]
- **Opaque pricing** – no public numbers. [4]

---

## 11. What yarns should borrow / avoid

**Borrow**
1. **One contact, every channel, one "Last Reached" clock.** Reach's best idea: door, call, text and email are all just *Contact Actions logged against the same Person*, sharing one history and recency timer. [11][person 8] yarns should make a knock and a text update the *same* contact timeline so an organiser sees "texted Tue, door-knocked Sat, replied Sun" in one view. This is exactly the door↔text coupling yarns wants – but yarns can go further than Reach by capturing the *content* of both sides, which Reach can't.
2. **Author surveys/scripts once, reuse everywhere.** A single Question Set powering the door survey, the text survey, and an in-app User Survey is the right model for yarns' "shared script/survey driving canned responses in both interfaces". [9][survey 8] Add the piece Reach lacks: expose those scripted lines as **canned replies inside the P2P inbox**, keyed to the same survey, so the door and inbox literally share one script object.
3. **Human-verified matching.** Let the volunteer confirm "yes, this is my friend Jacob" rather than auto-matching – better data and trust. [11]
4. **Tag history as an audit log** (who added/removed what, when) – cheap, valuable for data hygiene and dispute resolution. [export 8]
5. **Flat, unlimited-user pricing** as a volunteer-growth lever. [4]

**Avoid / improve on**
1. **Don't hand texting off to the native SMS app.** Reach's fatal limitation for a P2P texting platform: no inbox, no captured replies, no thread. [6] yarns' whole reason to exist is the *opposite* – keep the conversation in-platform. Treat Reach as the cautionary case, not the model, for messaging.
2. **Don't ship without a canonical disposition taxonomy.** Reach forcing every campaign to fake dispositions as survey questions is a real weakness. [2] yarns should ship a **first-class, shared disposition set across door and text** (e.g. Answered, No Answer, Not Home, Refused, Wrong Number, Moved, Do Not Contact) with campaign-extensible custom outcomes on top.
3. **Build the journey engine Reach skipped.** Action Cards + manual push is not automation. [9] yarns' "journeys" should be real time-based, condition-driven sequences (e.g. no reply in 48h → follow-up text; positive door ID → enrol in volunteer-recruitment journey) – auto-advancing, not admin-curated.
4. **Don't rely on an external walk-list app.** Reach openly tells users to also run MiniVAN for turf/maps. [2] If yarns wants real door-knocking, it needs native turf assignment and a map, or it inherits Reach's "supplement, not replacement" ceiling.

---

## 12. Sources

- [1] Reach – Knowledge base, "Comparing Reach to other canvassing apps": https://reach.vote/knowledge-base/comparing-reach-to-other-canvassing-apps/
- [2] (same as [1]) comparison vs MiniVAN/Polis/Ecanvasser/PDI, maps/turf, ad-hoc address lists, dispositions as survey questions: https://reach.vote/knowledge-base/comparing-reach-to-other-canvassing-apps/
- [3] Reach – Homepage / positioning: https://reach.vote/
- [4] Reach – Pricing: https://reach.vote/pricing/
- [6] Reach – Knowledge base, Contact Scripts: https://reach.vote/knowledge-base/contact-scripts/ and Contact Actions: https://reach.vote/knowledge-base/contact-actions/
- [7] Reach – Knowledge base, About Tags: https://www.reach.vote/knowledge-base/tags/
- [8] Reach – Knowledge base: Question Types https://www.reach.vote/knowledge-base/question-types/ ; Person Screen https://www.reach.vote/knowledge-base/person-profile-screen/ ; Survey Questions https://www.reach.vote/knowledge-base/survey-questions/ ; Export Data Formats https://reach.vote/knowledge-base/export-data-formats/ ; VAN Integration https://reach.vote/knowledge-base/van-integration/
- [9] Reach – Knowledge base, Action Cards: https://www.reach.vote/knowledge-base/action-cards/
- [10] Reach – How it Works: https://reach.vote/how-it-works/
- [11] Reach – Relational Organising with Reach: https://reach.vote/relational-organizing-with-reach/
- [12] Apple App Store – "Reach — Progressive Organizing": https://apps.apple.com/us/app/reach-progressive-organizing/id1433809365 ; Google Play: https://play.google.com/store/apps/details?id=com.reachVoteTech
- Note: GetApp listing at https://www.getapp.com/collaboration-software/a/reach/ describes a *different* product ("REACH Business Cloud") and was **excluded** as not the subject. No genuine G2/Capterra reviews for this Reach were located – marked Unknown – not found.

---

### 3-sentence summary for yarns

Reach's single strongest, directly-applicable idea is the **unified Person record**: door-knocks, calls, texts and emails are all logged as "Contact Actions" against one contact with a shared history and "Last Reached" clock, and the same reusable Question Sets/Contact Scripts feed every channel – but yarns should go beyond Reach by keeping the actual conversation and inbound replies *in-platform* rather than handing texting off to the volunteer's native SMS app (Reach's defining weakness for a P2P texting product). Reach has **no real conversation inbox, no native disposition taxonomy, and no automated journey engine** (engagement is manual Action-Card publishing), so yarns should treat all three as clear differentiation opportunities: ship a first-class shared door/text disposition set and a true time/condition-based journey engine. Finally, borrow Reach's flat unlimited-user pricing, human-verified contact matching, and tag-change audit log – but build the native maps/turf that Reach lacks if yarns wants door-knocking to stand alone rather than being a "supplement" to MiniVAN.
