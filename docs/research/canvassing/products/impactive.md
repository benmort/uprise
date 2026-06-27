# Impactive (now "ActBlue Field Tools", formerly Outvote)

Research dossier for the **uprise** P2P SMS organising platform. Focus: how Impactive couples texting with in-person/relational canvassing around a shared contact, plus shared scripts/surveys, sequences and disposition taxonomies.

> **Naming note.** The product was launched as **Outvote** (2017), rebranded to **Impactive** (2020), acquired by **ActBlue** on 17 September 2025 ("Impactive by ActBlue"), and rebranded again to **ActBlue Field Tools** in 2026 [9][10][11]. Marketing site is still `impactive.io`; help/docs now live under `help.actblue.com` [6]. This dossier uses "Impactive" throughout for continuity. Older docs sit under `outvote.zendesk.com` / `support.impactive.io` (both now redirect or are gated).

---

## 1. Positioning

- **Who it's for.** Democratic/progressive electoral campaigns, advocacy organisations, unions and non-profits. Named customers/users: Biden-Harris 2020, DCCC, SEIU, Black Voters Matter, HeadCount [3][4]. 2,000+ campaigns and organisations since 2017 [9][10].
- **Partisan/ideological lock-in.** This is explicitly a Democratic/progressive tool, reinforced by the ActBlue acquisition ("Democratic organizing platform", "Campaign-in-a-Box") [9][10]. Not a neutral civic vendor.
- **Geography.** US-only in practice. All positioning is around the US national voter file, NGP VAN/PDI, ActBlue, short codes and 10DLC. No evidence of international markets [4][5]. Multilingual scripts supported (English, Spanish, Korean, others on request) [2].
- **Electoral vs advocacy.** Both, from one platform. Electoral = voter registration + GOTV + SMS fundraising; advocacy = issue mobilisation and supporter action [3][4][5].

## 2. Full product scope

An "all-in-one digital organising suite". Modules [1][3][4]:

1. **Peer-to-peer (P2P) texting** – one-to-one volunteer-to-contact conversations.
2. **Broadcast texting** – mass SMS/MMS via short code / toll-free / 10DLC, with keyword-branched response flows [12].
3. **Phone banking** – predictive dialer + patch-through calling, web or mobile [1][3].
4. **Relational organising ("Friends and Family Messaging")** – volunteers sync personal contacts, matched to the voter file, and reach them by text/email/call/social DM [2][7].
5. **Canvassing** – three modes: Shared list, Assigned list, Open (see §3) [1].
6. **Voter registration / forms** – registration lookup and form submissions [1][4].
7. **Social media sharing / storytelling** – volunteers distribute campaign content to personal networks [13].
8. **SMS fundraising** – native ActBlue link integration, donor auto-import [12][5].
9. **Volunteer management** – recruitment, event RSVP, leaderboards/gamification [4][5].
10. **Reporting & data** – automated daily reports; CRM sync; enterprise Postgres mirror / S3 pipeline [7][14].

Channels span text, email, phone, social DM and in-person, all reporting into one contact record.

## 3. Canvassing / door-knock UX

**Critical finding for uprise: Impactive's "canvassing" is relational/list-based, not native map-based door-knocking.** It does NOT cut turf or draw walk maps itself – it explicitly points campaigns to **MiniVAN** for turf-cutting and route optimisation, and positions its own strength as relational outreach to people a volunteer already knows [16][1]. There are no native street maps, walk lists by geography, or route optimisation in the product as documented.

**Three canvassing modes** [1][15]:

- **Shared list canvassing.** A campaign shares one target list; volunteers self-select contacts they know or share affinity with. Selected contacts disappear from others' views to prevent duplication. Can run **with outreach** (text/email/call/social DM using campaign scripts, then file a report) or **without outreach** (just file insight reports – support level, community issues) [15].
- **Assigned list canvassing.** Campaign assigns a specific batch of contacts to each volunteer (typically matched by neighbourhood/workplace affinity) for relationship-building over time. Also with- or without-outreach [15][1].
- **Open canvassing.** Volunteer searches the voter file (by name, age, location), finds the person met in person or online, and files a report. No download required (web app). Designed for rallies, events, shops, doorstep encounters [1][17].

**Mobile/web.** iOS app ("ActBlue Field Tools", formerly Outvote/Impactive: Organize Online), 4.7★ across 3,400+ ratings, iOS 15.1+, also iPad/Mac M1/Vision Pro; free [18]. Web app also supports canvassing without a download [1]. No documented Android-specific detail – Unknown, not found.

**Offline.** Open canvassing works offline; data syncs back when wifi/cellular returns – pitched for low-connectivity areas [1][16].

**Geo/targeting.** Targeting by district, ZIP code or workplace; voter-registration lookup by name/age/location [1]. This is filtering, not mapping.

**Assignment.** Per-volunteer assigned lists (assigned mode), self-claim with lock-out (shared mode), or unbounded voter-file search (open mode) [15][1].

## 4. Data model

- **Contacts.** Central contact record. Sources: bulk import, CRM pull (NGP VAN/EveryAction, PDI), ActBlue donor auto-import, and volunteer personal-contact sync (relational) [7][14][5]. Bulk import/edit/delete supported [13].
- **Voter file matching.** Personal/imported contacts are matched to the national voter file to surface voting history, party affiliation and home district, used to target by voting frequency [2][13].
- **Addresses/geo.** Voter-file address data is present (used for district/ZIP targeting and voter lookup), but there's no documented native geocoding/map layer for door-to-door turf – that's delegated to MiniVAN [16][1]. Address-as-canvass-unit: Unknown, not found (the unit is the contact/voter, not the household door).
- **Dispositions / reports.** Captured via **tags** and **custom fields** on "outreach reports", plus free-text notes [1][7][8]. See §8.
- **Survey responses.** Tags and custom fields map to CRM **activist codes** and **survey questions** on sync-back [7].
- **Special contact attributes** for segmentation/analysis exist as a distinct concept [6].
- **Storage / sync.** Near-real-time CRM sync during campaigns; two-way with NGP VAN/EveryAction and PDI (pull lists, push back conversation data, tags→activist codes, fields→survey questions) [7][14]. Saved lists cache audiences without re-querying the CRM [14]. Enterprise: live **Postgres mirror** database and/or **S3** data pipeline for direct querying; an Export Database guide exists [7][14][6].

## 5. P2P texting / inbox

- **Conversation model.** One-to-one volunteer-to-contact threads in "a streamlined inbox built for speed". Volunteers send an admin-written **initial script**, then pick **response scripts** based on the predicted conversation outcome [1][3][8].
- **Agent/volunteer workflow.** Web and mobile. Volunteers work assigned contacts; the system can filter the queue by interaction history – e.g. whether a contact received a given script, replied, or matches custom fields [1].
- **Assignment / reassignment.** Conversations can be **reassigned to active volunteers or staff** – useful for escalation or handing off a live reply [1][8].
- **Scripts.** Dynamic variables (name, custom data) personalise scripts; separate "Writing Initial Scripts" and "Writing Response Scripts" docs confirm a two-layer script model [6][1].
- **Canned responses.** Volunteers select from canned responses for common cases (wrong number, opt-out, etc.); data captured via tags/custom fields [8].
- **Queueing.** Filtered/segmented queues by script-received, response status and custom fields [1]. Precise round-robin/claim mechanics not documented – Unknown, not found.
- **Compliance.** Abusive-message filtering, block hostile contacts, automated opt-out keyword monitoring, per-contact frequency caps, disconnected-number filtering [1].
- **Relationship to the canvassing/action side (the coupling, for uprise).** This is the key reference point. The **same contact record, the same tag/custom-field taxonomy, and the same script-and-response model** are reused across P2P texting, relational outreach and canvassing reports [1][7][8][15]. Coupling is achieved by a **shared data model and shared script/tag library**, not by a single unified inbox that merges door and text events. Concrete cross-channel mechanic: scripts can embed **RSVP/event links**, converting a text conversation directly into a scheduled in-person shift (one case study scheduled ~2,000 shifts in days) [2]. So texting → in-person is driven by links and shared contacts, with canvassing reports flowing back onto the same record.

## 6. Survey & script tooling

- **Scripts are reusable across channels.** The same script construct (initial + response scripts, dynamic variables) drives P2P texting, relational outreach and list-canvassing-with-outreach [1][15][6]. This is the strongest "shared script across door and text" precedent in the product.
- **Canned responses.** Library of pre-written replies volunteers pick during conversations (wrong number, opt-out, FAQ-style) [8].
- **Surveys.** Implemented as **survey questions / tags / custom fields** filled on outreach reports; supporters' answers drive which response script is shown [8]. On sync, tags → CRM **activist codes** and fields → CRM **survey questions** [7].
- **Reusability.** Tags and custom fields are org-level objects ("Tags: Creating and Managing", "Custom Fields: Creating and Managing"), so the same taxonomy spans texting, calling and canvassing reports [6]. There is no documented evidence of a single "survey object" rendered identically in both a door UI and a text UI – it's the underlying tag/field set that's shared, with each channel filing against it.

## 7. Journeys / engagement ladders

- **No first-class "journeys" / visual sequence builder is documented.** Searches and docs surface no named journey/sequence/drip-builder feature. Closest equivalents:
  - **Broadcast keyword-branched response flows** – recipients reply with keywords that trigger automatic responses, branching each person's path (event details, RSVP, donation link). This is rule/keyword automation, not a timed multi-step ladder [12].
  - **Opt-in automation and keyword triggers** for broadcast subscriber growth [3].
  - **Scheduling** of broadcasts (send now or later) and per-contact no-contact windows / frequency caps [12].
  - **Assigned list canvassing** framed as escalating engagement "over time" – but this is a human relationship cadence, not platform-automated sequencing [1][15].
- **Verdict for uprise:** Impactive is a weak reference for journeys. Its automation is keyword/branch-based within a single broadcast, plus human-driven relational nurture. There is no automated, time-based, cross-channel engagement-ladder engine documented [12][3]. (Treat as "Unknown – not found" for any true multi-step journey automation.)

## 8. Disposition / tag taxonomy

- **Mechanism, not fixed list.** Impactive does not ship a fixed canonical disposition set; dispositions are **campaign-defined tags + custom fields** filed on reports, plus free-text notes [1][7][8]. "Tags: Creating and Managing" and "Custom Fields: Creating and Managing" are admin tasks [6].
- **Documented concrete examples** (illustrative, not exhaustive): canned-response/disposition cases of **wrong number** and **opt-out / do-not-text** [8]; canvass report fields for **support level** and **community issues** [15]; general "voter sentiment" tags + notes [16][1]. Classic codes like "not home"/"not interested" are configured by the campaign as tags rather than provided out-of-the-box – Unknown whether any defaults ship.
- **CRM mapping.** Tags → NGP VAN/PDI **activist codes**; custom fields → CRM **survey questions** [7]. This dictates a flat tag taxonomy that round-trips cleanly to VAN.

## 9. Pricing & access model

From the FAQ (pre-ActBlue-rebrand pricing) [3]:

- **Standard:** US$50/month – full feature access + support.
- **Enterprise:** from US$1,000/month – dedicated strategist, custom onboarding, Postgres mirror / S3 access.
- **Usage – SMS (P2P + broadcast):** 2.5¢ per segment.
- **Usage – MMS:** 5¢ per message.
- **Usage – phone banking:** 5¢ per dial.
- **Usage – forms / voter registration:** 1,000 free/month, then $0.08 per submission.
- **Support:** help centre, <15-minute email/DM response, weekly admin trainings (Tuesdays), office hours (Thursdays) [3].

Post-acquisition pricing under "ActBlue Field Tools" not re-confirmed – treat the above as the last published figures; current pricing Unknown, not found.

## 10. Strengths & gaps

**Strengths**
- Genuinely multi-channel on one contact record (text, broadcast, dialer, relational, canvass) [1][3].
- Strong relational engine: personal-contact sync + voter-file match + affinity-based assignment [2][15].
- Clean, two-way VAN/PDI sync with tag→activist-code / field→survey-question mapping and enterprise raw-data access (Postgres/S3) [7][14].
- Well-regarded mobile app (4.7★, 3,400+ ratings) [18]; fast support [3].
- Shared script + tag library reused across channels – the core "coupling" idea [1][8].

**Gaps**
- **No native door-knocking maps/turf/routing** – delegates to MiniVAN; weak for true field door programs [16][1].
- **No documented journey/sequence automation engine** – only keyword branches + scheduling [12].
- **Disposition taxonomy is BYO** – no shipped canonical result codes; consistency depends on the admin [8][1].
- US/Democratic-only; voter-file-centric data model doesn't transfer to non-US or non-electoral contexts [4][9].
- Thin third-party review depth (G2/Capterra largely empty); App Store is the main public review signal [reviews-meta][18].
- Coupling is via shared data + RSVP links, **not** a single merged door+text timeline/inbox – there's headroom to do better [2][1].

## 11. What uprise should borrow / avoid

**Borrow**
1. **One contact record, many channels.** Texting, calling and canvassing all file against the same contact with the same tag/custom-field set. This is the cleanest way to make a door knock and a text thread "couple" – do this at the data layer first [1][7].
2. **Two-layer script model: initial script + response scripts keyed to outcome.** Reuse the identical construct in BOTH the door UI and the text inbox so a script written once drives canned responses everywhere [1][6][8]. This directly matches uprise' "shareable script/survey that drives canned responses in both door and text".
3. **Surveys as tag/custom-field objects that round-trip to a CRM.** Map cleanly to external activist-code/survey-question semantics so data is portable [7].
4. **Assignment trio: assigned / self-claim-with-lockout / open search.** The shared-list "contact disappears when claimed" lock-out is a simple, effective concurrency model for both turf and text queues [15].
5. **Embed action links in scripts** (RSVP/event/donate) so a text conversation converts to an in-person action – a lightweight coupling primitive worth copying [2][12].
6. **Offline-first canvass capture with later sync** [1][16].

**Avoid / improve on**
1. **Don't outsource maps.** Impactive's biggest weakness is no native turf/maps/routing. uprise' new door-knock feature should own walk lists, household/address units and routing natively – this is a clear differentiation gap to close, not copy [16][1].
2. **Build a real journeys engine.** Impactive has none. uprise' "journeys" (time-based, cross-channel, branchable engagement ladders that span door + text) would be a genuine leap beyond keyword-branch automation [12][3].
3. **Ship a canonical disposition taxonomy with sane defaults** (e.g. not home, not interested, supporter, moved, wrong number, opt-out) that admins can extend – don't make every org reinvent it, since BYO tags hurt cross-org consistency and analytics [8][1].
4. **Make coupling a unified timeline, not just shared rows.** Go past Impactive's "same record" approach to a single merged contact timeline/inbox where a canvasser sees the prior text thread and a texter sees the last door result inline [1][2].
5. **Don't inherit the US-voter-file dependency.** Keep the data model channel- and jurisdiction-agnostic so it works outside US electoral contexts [4][9].

## 12. Sources

- [1] https://www.impactive.io/solutions/canvassing
- [2] https://www.impactive.io/lp/relational-organizing
- [3] https://www.impactive.io/faqs
- [4] https://www.impactive.io/solutions-for/electoral-campaigns
- [5] https://www.impactive.io/solutions-for/advocacy-organizations
- [6] https://help.actblue.com/hc/en-us/actblue-field-tools-formerly-impactive-by-actblue
- [7] https://www.impactive.io/solutions/integrations
- [8] https://www.impactive.io/solutions/peer-to-peer-texting (P2P inbox, canned responses, reassignment) + help-centre search result on P2P Texting Actions
- [9] https://www.actblue.com/posts/press-release-actblue-acquires-impactive-leading-democratic-organizing-platform-expanding-power-to-support-campaign-operations/
- [10] https://www.actblue.com/posts/introducing-actblue-field-tools/
- [11] https://www.prnewswire.com/news-releases/actblue-acquires-impactive-leading-democratic-organizing-platform-expanding-power-to-support-campaign-operations-302558557.html
- [12] https://www.impactive.io/solutions/broadcast-texting
- [13] https://www.impactive.io/blog/5-must-have-features-of-relational-organizing-software
- [14] https://www.impactive.io/solutions/integrations (enterprise Postgres mirror / S3, saved lists, near-real-time sync)
- [15] https://www.impactive.io/blog/introducing-list-canvassing-boost-your-canvassing-abilities-with-relational-outreach
- [16] https://www.impactive.io/blog/how-to-use-a-canvassing-app-to-gotv-more-efficiently
- [17] https://outvote.zendesk.com/hc/en-us/articles/360039507473-Open-Canvassing (title/summary via search; page now gated 403)
- [18] https://apps.apple.com/us/app/impactive-organize-online/id1302881906
- [reviews-meta] https://www.g2.com/products/impactive/reviews ; https://www.capterra.com/p/238578/Impactive/ (both thin/empty on review volume as of June 2026)
