# NGP VAN / MiniVAN – product dossier

Research date: 2026-06-16. Australian English. Citations [n] map to the Sources list.

The single most important structural fact for uprise: NGP VAN does **not** ship a native peer-to-peer texting inbox. It ships a shared voter/contact database (VAN) plus a mobile door-knocking app (MiniVAN) and phone-bank tools, and it lets **the same Survey Questions and Activist Codes** drive scripts across door, phone and (third-party) text channels by writing back to one contact record. Uprise' bet (door + P2P text in one product around a shared record) is the thing VAN approximates only by stitching first-party canvassing onto third-party texting.

---

## 1. Positioning

- **Who it's for:** Democratic and progressive campaigns and organisations in the US. VAN is effectively the monopoly voter-file and field platform on the US progressive side – by 2009 it was the largest partisan campaign-compliance vendor, used by most Democratic members of Congress, and is described as "vital … Democratic and progressive tech infrastructure" [7]. MiniVAN logged 92% of the ~41 million doors knocked on the platform in 2023 [1].
- **Geography:** US-centric (Washington DC HQ). Also used by the UK Liberal Democrats and Canada's Liberal Party, but the product, voter-file model and result-code taxonomy are built around US voter files [7]. Not a general international canvassing tool.
- **Electoral vs advocacy:** Primarily **electoral** (candidate campaigns, party committees, GOTV). The advocacy/non-profit side is served by the sibling product **EveryAction** (online actions, fundraising, advocacy email/SMS), now under Bonterra [3][7]. The two share lineage and integrate, but VAN/MiniVAN is the field-organising/electoral half.
- **Ownership:** Formed Nov 2010 by merging NGP Software (1997) and Voter Activation Network (2001). Acquired by Apax Partners in 2021 (~$2bn) and operated under **Bonterra**; EveryAction is now in Bonterra's fundraising line while NGP VAN continues serving campaigns [7].

## 2. Full product scope

VAN is a suite, not a single app. Components relevant here [1][7][12]:

- **VAN / VoteBuilder** – the core web voter database: voter file, My Voters and My Campaign databases, targeting/list-building ("cut a universe"), turf-cutting, reporting, contact history.
- **MiniVAN (MiniVAN Touch)** – the free mobile door-knocking app (iOS/Android). Pulls walk lists, records canvass responses, syncs back to VAN [1][4].
- **MiniVAN Manager** – paid add-on giving organisers real-time location/progress/effectiveness stats per canvasser [4][8].
- **Optimised Routing** – add-on that calculates fastest walking/driving order through a turf [1].
- **Virtual Phone Bank (VPB)** and **Open Virtual Phone Bank (OpenVPB)** – browser phone-banking tools driven by the same Scripts/Survey Questions [9][12].
- **VPB Connect** – power/predictive-dialler phone banking [9].
- **Scripts, Survey Questions, Activist Codes** – the shared canvassing-content layer (see §6).
- **Online Actions** (EveryAction side) – petition/sign-up/volunteer forms, FastAction one-click, email automations [3][14].
- **Targeted Email & Mobile Messaging** (NGP 8 / EveryAction) – broadcast email and SMS with automation; Mobile Messaging is the closest first-party SMS, but it is **broadcast/keyword-based**, available only in NGP 8, not a P2P texting inbox [13].
- **API** – documented REST API (docs.ngpvan.com) exposing people, canvass responses, result codes, survey questions, activist codes, events; community Python wrapper via Parsons [6].

## 3. Canvassing / door-knock UX

- **Walk lists:** Organisers build a voter universe in VAN, then generate a **list number**. Volunteers download MiniVAN, create an **ActionID** (free login), and type the list number to pull their assigned voters [1][8].
- **Turf-cutting:** Done in VAN. Lists are cut into turfs of ~80 doors, either by drawing boundaries by hand on a map or with a "create turf automatically" button [1]. Turf is a geographic cluster of targeted voters rather than scattered addresses.
- **Distributed canvassing:** Instead of pre-cut, pre-assigned turf, organisers share one list number broadly; the app uses the **volunteer's current location to assign the nearest doors that still need knocking**, so volunteers can self-start anywhere. This is VAN's answer to relational/at-will canvassing [5].
- **Maps & route order:** In-app map of the turf; **Optimised Routing** (add-on) computes fastest walking/driving route order [1].
- **Offline mode:** MiniVAN is designed to work in the field and **commit data to the database automatically** as you go to avoid loss; it caches the list so canvassers can knock and record without continuous connectivity, syncing when back online. Reviews flag that **cross-canvasser sync is unreliable** – teams struggle to see in near-real-time which doors others have already hit – and that GPS placement of houses and battery drain are pain points [11].
- **Mobile app UX:** Per-contact card shows Script / Details / Notes / History tabs; canvassers tap survey responses and an "I Couldn't Reach This Contact" path. Households: you can record multiple members at an address but reviewers want fewer clicks to do so. Fast disposition: swipe-right or press-and-hold to mark **Not Home** [1][12].
- **Assignment to canvassers:** Two models – pre-assigned turf (organiser cuts and hands out list numbers) or distributed/location-based self-assignment [5][8]. MiniVAN Manager tracks who is where and progress in real time [4].

## 4. Data model

- **Contact record:** Each person is a row in the VAN voter file keyed by **VANID** (and, in My Campaign, a separate Campaign ID). MiniVAN, phone banks and synced third-party texting tools all read/write against this same person record [6][10].
- **Addresses / geo:** Voters carry registration addresses; turf-cutting and routing operate on those geo-coded addresses. (Exact geocoding internals – Unknown, not found in public docs.)
- **Canvass responses:** The atomic unit is a **Canvass Response** posted to a person. A canvass response carries a **Contact Type** (e.g. Walk/House Visit, Phone, SMS/Text, Lit Drop, Letter, Digital Ads), an **Input Type**, a **date/canvassed-by**, and either a **Result Code** (a non-contact or terminal outcome) or **responses** (survey answers / activist codes) [2][6][12].
- **Result codes vs responses:** A successful conversation produces the implicit result **Canvassed** and stores the survey/activist data. A non-conversation produces a **Result Code** (Not Home, Refused, etc.). Result-code availability is filtered by Contact Type (e.g. "Wrong Number" only for Phone; "Inaccessible"/"Moved" for Walk) [2][12].
- **Survey responses:** A **Survey Question** is a reusable object with defined response options; a chosen option can be mapped to a canvass status. Notably, survey/activist data is only written to the record if the chosen response maps to a "Canvassed" (or blank) status – i.e. you must have actually reached the person [2].
- **Activist codes:** Reusable yes/no-style tags ("Volunteer", "Lawn Sign", issue supporter) applied to records to label interest/relationship [10][12].
- **How outcomes sync:** MiniVAN commits canvass responses to VAN in (near) real time as canvassers work; organisers can review data integrity before final commit [1]. Third-party text/phone tools sync survey answers, activist codes, canvass results and event RSVPs back to the same VANID automatically, no manual "sync" button [10].

## 5. P2P texting / inbox

- **There is no native P2P texting inbox in VAN/MiniVAN.** First-party SMS is **Mobile Messaging** (NGP 8 / EveryAction) – **broadcast/bulk** sends plus keyword auto-replies (e.g. text DONATE → link). It supports two-way at the broadcast level but is not an agent-style conversational inbox with per-conversation assignment to volunteer texters [13].
- **P2P texting is done via third-party tools** that integrate with VAN – principally **ThruText/GetThru** (also CallHub, Hustle, Scale to Win, Impactive). These provide the texter inbox UX; VAN provides the universe and the contact record [10][13].
- **Shared contact timeline:** Achieved by **two-way sync back to the VANID**, not by a unified inbox. ThruText pulls a VAN list, texters hold conversations, and replies recorded as survey answers/activist codes/canvass results are written back to the same person record [10]. So canvass and text outcomes do land on one VAN contact history – but the conversation UIs are separate products.
- **Shared assignment:** No. Door-knock turf assignment (MiniVAN) and text-conversation assignment (ThruText etc.) are managed in different systems; there is no single "this volunteer owns this contact across channels" primitive.
- **Shared outcomes:** Yes at the data layer – there is a **Texted** result code, and texting writes the same Survey Question / Activist Code objects that door and phone use [9][10][12]. That is the genuinely strong part of the model.

## 6. Survey & script tooling

This is VAN's strongest area and the closest analogue to uprise' "shareable script/survey that drives canned responses in both door and text" ambition [12].

- **Building blocks (reusable across channels):**
  - **Survey Questions** – a question with predefined response options; created once, reused everywhere.
  - **Activist Codes** – reusable tags.
  - **Text/Script Elements** – introductions, talking points, transitions, goodbyes; can carry Spanish translations.
- **Scripts** assemble Text elements + Survey Questions + Activist Codes into a flow. When adding a Survey Question or Activist Code to a script you **pick from ones already created** – enforcing a shared library rather than per-script duplication [12].
- **Two script types:**
  - **Linear** – stacked elements, single path. Supported by **MiniVAN, VPB and OpenVPB** [12].
  - **Branched** – each response option routes to a numbered next element ("End" to finish); every element must branch or end. Supported by **MiniVAN and OpenVPB** [12].
- **Cross-channel reuse – confirmed:** "Two script types you can use **with MiniVAN or your phone banks**" [12]. The same script and the same Survey Questions therefore drive **door (MiniVAN), phone (VPB/OpenVPB)** and – via sync – **text (ThruText et al.)** [9][10][12]. Canned responses are the Survey Question's predefined options, shown as tap targets in MiniVAN and as dropdowns/checkboxes in OpenVPB.
- **OpenVPB** lets you set a default script plus up to 4 alternates, targetable by subgroup, with caller toggling [12].
- **Sharing/governance:** Scripts have an **Owner Committee** and are editable only there; **Committee Access** and **Other Database Access** selectors share a script (and its survey questions) to other committees/databases for reuse [12].
- **Canvass Result Options** are configured per script and per contact type (Digital Ads / House Visit / Letter / Lit Drop / Phone results), letting you record "couldn't have the conversation" outcomes [12].

## 7. Journeys / engagement ladders

- **In VAN/MiniVAN field tooling: essentially none.** Canvassing is event-by-event; there is no trigger→action sequence engine on the field side. The ladder of engagement is expressed through **Activist Codes** (tags accumulate on a record over time) and through manually re-cutting universes for the next touch, not through automation [10][12].
- **Automation lives on the EveryAction / NGP digital side**, not in canvassing: **email/SMS automation series** (welcome series, donor re-solicitation, re-engagement) and Online Actions forms that capture engagement data into the central database [3][13][14]. These are marketing-style drip sequences, not multi-channel organiser journeys that thread door+text+phone touches for one contact.
- **Net:** VAN has the *data* to power a ladder (every touch on one record) but **no native journey/sequence engine** that turns "knocked + said maybe" into an automated next-step across channels. This is a real gap and an opportunity for uprise. (A purpose-built cross-channel journey engine in VAN – Unknown, not found.)

## 8. Disposition / outcome taxonomy

VAN distinguishes **Result Codes** (the contact could not be / was not surveyed) from **Canvassed** (reached, with survey/activist data). Result-code availability is filtered by Contact Type [2][12].

**House Visit (door / MiniVAN) result codes** [2]:
- **Not Home** – no one answered.
- **Refused** – hostile / refused to talk.
- **Inaccessible** – door unsafe/unreachable (locked gate, dog, etc.).
- **Moved** – occupant says the voter no longer lives there.
- **Language Barrier** – confirmed person but can't communicate.
- (plus **Canvassed**, applied implicitly when survey responses are submitted.)

**Phone (OpenVPB) result codes** [2]:
- **Not Home** (rang through, no pickup), **Refused**, **Moved**, **Left Message**, **Wrong Number**, **Disconnected**, **Language Barrier**.

**Configurable Canvass Result Options checklist (from the Scripts UI, Phone Results column)** [12]:
Busy · Deceased · Disconnected · Do Not Call · Left Message · Moved · Non-Citizen · Not Home · Other Language · Spanish · Texted · Wrong Number.
(Separate result sets exist for Digital Ads, House Visit, Letter and Lit Drop contact types.)

**Texted** – applied automatically when a campaign's initial scripted messages are sent [10].

**Caution flag in the product:** Moved, Wrong Number, Deceased and Do Not Email are **terminal** codes that **mark the contact's data as bad** and affect everyone's searches in the shared database – VAN explicitly warns to train canvassers on these [12]. Worth copying: outcomes that mutate shared data quality need guardrails.

## 9. Pricing & access model

- **MiniVAN itself is free** to canvassers; using it requires a free **ActionID** account and access to a VAN list [8].
- **VAN access is licensed**, typically brokered through state parties / coordinated campaigns / approved committees rather than bought off a public price page; you must be an approved Democratic/progressive entity. Public per-seat pricing – Unknown, not found.
- **Paid add-ons:** **MiniVAN Manager** (organiser tracking) and **Optimised Routing** are explicit add-ons; exact prices not published [1][4][8].
- **Access gating:** Strongly gated to the progressive ecosystem (committee structure, database access controls). Not self-serve for arbitrary organisations.

## 10. Strengths & gaps

**Strengths**
- **One shared content library across channels** – Survey Questions and Activist Codes built once, reused in door/phone/(text) scripts. This is the model uprise wants [12].
- **One shared contact record** – door, phone and synced text outcomes all land on the VANID with history [6][10].
- **Branched scripts** that physically guide novice volunteers down the right path on the door [12].
- **Distributed/location-based assignment** – low-friction volunteer self-start without an organiser cutting turf [5].
- **Real-time-ish commit** of field data, removing post-canvass data entry [1].
- **Mature, granular disposition taxonomy** filtered by contact type, with data-quality guardrails on terminal codes [2][12].

**Gaps**
- **No native P2P texting inbox** – texting is outsourced to third parties; the cross-channel experience is a sync, not a single timeline/inbox [13].
- **No cross-channel journey/sequence engine** in field tooling; ladders are manual via tags and re-cut universes [10].
- **No unified per-contact assignment** across door and text.
- **Reliability/UX debt:** unreliable cross-canvasser sync, GPS placement issues, battery drain, household entry click-heavy; steep learning curve for admins [11]. The platform itself has had well-documented reliability problems under peak load [7].
- **Closed ecosystem / US voter-file-shaped** – not adaptable to non-US or non-electoral contexts without heavy lifting [7].

## 11. What uprise should borrow / avoid

**Borrow**
1. **A single reusable Survey Question + tag library that scripts compose from**, with the *same* objects driving both the door interface and the text inbox. VAN proves the org-side value of "create the question once, use it everywhere." Uprise should make this native across door + text rather than via sync [12].
2. **Survey response options as the canned responses.** In MiniVAN a Survey Question's options are tap targets; in OpenVPB the same options are dropdowns; in a text inbox they become quick-reply chips. One definition, channel-appropriate rendering. This is exactly uprise' "canned responses in both door and text" goal [12].
3. **Branched scripts** to lead inexperienced volunteers, with each response routing the next step – directly applicable to both door and text [12].
4. **Contact-type-aware disposition taxonomy** with explicit **terminal codes that flag data quality** (Moved, Wrong Number, Deceased) and require confirmation – uprise should bake guardrails in, not bolt on later [2][12].
5. **Distributed, location-based self-assignment** for canvassers as a first-class mode, not just pre-cut turf [5].
6. **Auto-commit field data** with an organiser review step before it's trusted [1].

**Avoid / beat**
1. **Don't split channels across products.** VAN's biggest weakness is that texting is a separate tool synced back. Uprise' edge is a **genuinely shared contact timeline and per-contact assignment** where a door conversation and a text thread are the same record in one inbox – build the thing VAN can only approximate.
2. **Don't leave journeys to manual re-cutting.** Ship a **trigger→action journey engine** ("knocked + maybe" → schedule a follow-up text; "not home x2" → drip a reminder) – the explicit gap in VAN.
3. **Don't repeat the sync/reliability failures** – cross-canvasser real-time state, accurate map pins, low battery cost and minimal taps for household members are the named complaints; treat them as launch requirements [11].
4. **Don't over-gate.** VAN's closed, committee-brokered access is a moat for them but a barrier; uprise can win the non-electoral / international / smaller-org space VAN ignores.

## 12. Sources

- [1] MiniVAN Canvassing: A Complete Guide for Users – https://www.ngpvan.com/blog/canvassing-with-minivan/
- [2] What Canvass Result Do I Use? (Minnesota DFL / VAN) – https://dflvan.freshdesk.com/support/solutions/articles/48001163433-what-canvass-result-do-i-use-
- [3] EveryAction is Part of the Bonterra Family – https://www.bonterratech.com/blog/everyaction
- [4] MiniVAN 8 introduction / MiniVAN Manager – https://www.ngpvan.com/blog/minivan8/
- [5] What is Distributed Canvassing? – https://www.ngpvan.com/blog/what-is-distributed-canvassing/
- [6] NGP VAN canvass responses / result codes API reference – https://docs.ngpvan.com/reference/canvassresponsesresultcodes (and /reference/peoplevanidcanvassresponses)
- [7] NGP VAN – Wikipedia – https://en.wikipedia.org/wiki/NGP_VAN
- [8] ActionID – https://www.ngpvan.com/actionid/ ; MiniVAN Support – https://supportcenter.ngpvan.com/minivan-support
- [9] VPB Connect / virtual phone banking – https://www.ngpvan.com/solutions/vpb-connect/ ; OpenVPB volunteer instructions
- [10] ThruText/GetThru VAN integration – syncing responses, survey questions, activist codes, canvass results – https://help.getthru.io/support/solutions/articles/44001782018-sync-responses-survey-questions-activist-codes and https://help.getthru.io/support/solutions/articles/44001063792-sync-responses-integrating-your-thrutext-campaigns
- [11] MiniVAN Touch reviews (sync, GPS, battery, clicks) – https://justuseapp.com/en/app/352087547/minivan-touch/reviews and https://apps.apple.com/us/app/minivan-touch/id352087547
- [12] How to: Create and use Scripts (NGP VAN PDF) – https://www.ngpvan.com/wp-content/uploads/2024/10/Create-and-use-Scripts.pdf ; script branching help
- [13] NGP VAN text banking & Mobile Messaging – https://www.ngpvan.com/blog/text-banking/ and https://www.ngpvan.com/blog/political-text-messaging-service/
- [14] Online Actions / automations – https://www.ngpvan.com/feature/online-actions/

---

### 3-sentence summary for uprise

NGP VAN already does the thing uprise most cares about – **a single reusable library of Survey Questions and Activist Codes whose response options become the canned answers in both the door app (MiniVAN) and phone/text scripts**, all writing back to one shared contact record (VANID) – which validates uprise' "shared script/survey across channels" thesis. But VAN has **no native P2P texting inbox** (texting is outsourced to ThruText/GetThru and merely synced back) and **no cross-channel journey/sequence engine** (ladders are manual via tags and re-cut universes), so uprise' winning wedge is making the door conversation and the text thread genuinely the *same* timeline with shared per-contact assignment plus trigger→action journeys. Borrow VAN's reusable survey-driven scripts, branched flows, contact-type-aware disposition taxonomy (with guardrails on terminal "bad data" codes) and location-based distributed assignment; avoid its split-product channels, manual ladders and well-documented sync/GPS/battery reliability debt.
