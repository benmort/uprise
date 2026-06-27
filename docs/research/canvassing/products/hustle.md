# Hustle – Product Dossier

Research date: 16 June 2026. Sources verified against primary (hustle.com, help.hustle.com) and credible secondary sources. Items that could not be confirmed are marked "Unknown – not found".

---

## 1. Positioning

Hustle is a person-to-person (P2P) text, video, and voice messaging platform, founded December 2014 by Perry Rosenstein, Roddy Lindsay, and Tyler Brock [1][12]. As of April 2026 it is independent and employee-owned, after employees purchased the company; Jesse Hassinger became CEO in February 2025 [12].

- **Who it's for:** nonprofits, education (universities, for fundraising and student engagement), commercial, politics, government, and labour unions [2]. The product's DNA is electoral and advocacy organising – it grew out of the 2015–2016 Clinton and Bernie Sanders campaigns and a 2017 NGP VAN partnership [12].
- **Geography:** United States. Compliance posture (FCC P2P definition, 10DLC, TCPA, short codes) is US-specific [3][13]. No evidence of Australian or international carrier support – Unknown for non-US deployment.
- **Electoral vs advocacy vs commercial:** primarily electoral and advocacy (Democratic campaigns and progressive nonprofits – the 2024 CEO Trump-fundraiser controversy angered Democratic clients [12]), with a secondary commercial and higher-ed market. Positioning centres on "relational organising" and authentic two-way conversation, not blast marketing [4][5].

Core pitch: human-initiated ("manual dial") messaging that meets the FCC's P2P definition, avoiding auto-dialer/TCPA exposure, with claimed 98% open rates and over one billion conversations initiated since 2014 [2][3][4].

---

## 2. Full product scope

Channels and major features [2][6][14]:

- **P2P texting** – message thousands from local numbers, with real-time two-way replies. Each send is human-initiated by an agent.
- **Broadcast SMS** – one-to-many simultaneous sends.
- **MMS** – images, GIFs, media in both P2P and broadcast; automations now support MMS [2][9].
- **Conversational Video Suite** – Hustle Clips (short-form video over text), Personalized Clips (custom video to engaged contacts), Hustle Stories (drive to long-form video) [2][6]. Video came via the 2021 acquisition of Tape [12].
- **Dialer / calling** – a single dialer type; supports instant follow-up texts during calls and voicemail drop [14]. Calling is a secondary feature, not a full call-centre suite.
- **Keywords & Automations** – keyword-triggered actions (send message including MMS) [9].
- **Scripts** – admin-authored initial and response scripts with merge variables and a script library [7][8].
- **Surveys** – via VAN Survey goal type, mapping radio-button responses to a VAN survey question [10].
- **Tags** – contact-profile, opt-out-reason, and admin-only tags; can sync to VAN [11][16].
- **Custom fields** – imported per-contact data for targeting, segmentation, and script personalisation [8].
- **Goals / Group Goals** – the campaign container; six goal types (see §7) [15].
- **Reporting / analytics** – link-click tracking, delivery/response rates, group goal performance, admin reports [6].
- **Integrations** – NGP VAN / EveryAction, Salesforce, Blackbaud [11][14]. Comparison sources call the integration set narrow (≈3 direct integrations) [14].
- **Apps** – web agent interface plus iOS/Android mobile apps [1].

Explicitly absent (per comparison sources) [14][17]: email marketing, voice broadcast / press-1 IVR, multiple dialer types, call recording, live call monitoring/coaching, AI call summaries, and a shared team inbox.

---

## 3. Canvassing / door-knock UX

**Hustle has no native door-knocking or canvassing feature.** There is no walk-list, no map/route, no turf cutting, and no offline door-canvasser app. Wikipedia and feature comparisons confirm the absence [12][14]. Hustle's own content frames texting as a *complement* to door canvassing rather than a substitute – "peer-to-peer text messaging serves as a complementary channel to door-to-door canvassing" [18].

How it relates to canvassing in practice:

- Hustle tags can sync to NGP VAN **canvass results** (alongside survey responses and activist codes) [16]. So data captured over text lands in the same VAN objects a door canvasser would write to – making VAN the shared layer between the two activities, not Hustle itself.
- Its "relational organising" framing is about volunteers texting people they already know, not about field canvassing. Notably, one comparison source (CallHub) flatly lists "relational organizing" as something Hustle does NOT do [14] – this contradicts Hustle's own marketing [4][5]. The honest read: Hustle does *relational texting* (assign agents their own contacts) but lacks the relational-organising scaffolding (contact-import-from-phonebook social graph, friend-to-friend turf, relational journeys) that purpose-built tools like Impactive offer.

For uprise: Hustle is a texting-first tool that defers all field/canvass coupling to VAN. There is no shared-contact door↔text experience inside Hustle.

---

## 4. Data model

Core objects (from Hustle's glossary) [19][15]:

- **Lead / Contact** – the person agents message (members, donors, voters). Imported via CSV or VAN sync.
- **Agent** – the individual who texts/messages contacts.
- **Manager** – oversees groups or inboxes; can create groups, edit settings, add contacts, launch goals, export data.
- **Group** – an organisational container of contacts and managers.
- **Goal / Group Goal** – the campaign unit; agents work a goal to completion.
- **Segment** – contacts in a goal are split into batches so agents pace outreach and keep up with replies.
- **Workflow** – three types: **Initial** (first message), **Reply** (respond to unread inbound), **Reminders** (re-contact contacts marked "Yes" in Reply) [19].
- **Lead Action** – the response marked for a contact in a goal (e.g. Yes, No), capturing disposition (see §8).
- **Tag** – categorisation applied to contacts (see §8).
- **Custom field** – imported per-contact attributes (address, district, ward, precinct, contribution history); usable for targeting, segmentation, and as script merge variables; can be hidden from agents [8].
- **Survey response** – captured via VAN Survey goals, mapped to a single VAN survey question [10].

Storage/sync:

- Contacts and results live in Hustle, with optional bidirectional sync to **NGP VAN / EveryAction** (My Campaign and My Voters), Salesforce, and Blackbaud [11][14].
- VAN sync constraints: only **one response per survey question** syncs (most recent wins); you **cannot target a goal based on VAN survey responses** (e.g. can't filter by "Strong support") [10]. Opt-outs sync to VAN as "SMS Opt-In Status: Opt-Out" if enabled at integration setup [11][16].
- Tags sync to VAN survey responses, activist codes, and canvass results [16].

No public detail on data residency, retention windows, or API schema – Unknown.

---

## 5. P2P texting / inbox

Conversation model [6][7][19]:

- Agents send from **local numbers** and receive real-time replies; conversations are genuinely two-way (distinguishing Hustle from blast tools) [6].
- Agents work inside a **goal** via the three workflows: Initial (start conversations), Reply (clear inbound), Reminders (re-engage "Yes" contacts) [19].
- **Assignment:** admins/managers "assign agents (or teams of agents) their own texting goals"; contacts are targeted into goals via filters and split into **segments/batches** to pace each agent [6][19].
- **Agent workflow:** agent logs into web or mobile app, opens an assigned goal, sends the initial script (often by repeatedly pressing Send), then handles replies using response scripts, applies tags / marks a lead action, and can opt a contact out with a reason [7][15][16].
- **Scripts in the inbox:** agents pick from admin-authored response scripts and can also create **personal supplemental response scripts** visible only to themselves and reusable across all their workflows [7].
- **Rich content:** agents can insert personalised video, links, GIFs, and emojis [6].

Limitations: a comparison source states Hustle has **no shared team inbox** and is "less suited for teams needing real-time conversation management" [17]. So the model is agent-owns-their-contacts rather than a pooled queue with round-robin assignment.

---

## 6. Survey & script tooling

**Scripts** [7][8][20]:

- Two kinds: **Initial scripts** (open the conversation; auto-append "you can reply STOP to opt out"; capped at a 57-segment limit for deliverability) and **Response scripts** (follow-ups, links, images, used to sustain the two-way conversation) [7].
- Scripts support **variables / merge fields**: Hustle defaults (contact name, agent name, Link, etc.) plus any **custom field** (shown in purple), auto-populating from goal setup [8].
- A **script library** lets admins reuse scripts across goals [20].
- Admins see character and segment counts and can attach images [7].
- Agents can author their own private response scripts (reusable across their workflows) [7].

**Surveys** [10]:

- Delivered through the **VAN Survey goal type**. Admin picks one VAN survey question; its response options auto-populate as **radio buttons** in the agent interface, and each answer type pre-populates a response script slot so the agent adds a custom conversational line. Selected responses sync to VAN [10].
- Constraint: one VAN survey question per goal; only the most recent response syncs [10].

**Reusability across channels:** scripts and the script library are **text/video only**. There is no door/canvass interface, so scripts do not drive a canvassing UI. The only cross-surface reuse is via VAN: a tag or survey captured over text writes to the same VAN object (survey response / activist code / canvass result) that a separate canvassing tool would write to [16]. Hustle itself does not have one script object that powers both a door script and a text script.

---

## 7. Journeys / engagement ladders

Hustle has **no true journey/sequence builder** (no multi-step, time-delayed, branching automation). Comparison sources call out "limited deep trigger-based automation for complex sequences" and "multi-channel automation limited to text-triggered workflows" [17][14].

What exists instead:

- **Keywords & Automations** – an inbound keyword triggers one or more actions, e.g. send an (MMS-capable) auto-response [9]. Single-step, reactive, not a sequenced ladder.
- **Reminders workflow** – re-contacts contacts previously marked "Yes," a built-in one-hop follow-up rather than a configurable sequence [19].
- **Goal chaining (manual)** – organisers ladder engagement by running successive goals against segments (e.g. recruit → invite to event → request a call), but this is human-orchestrated, not automated [15].

There is no relational "journey" that walks a single contact through an engagement ladder automatically across channels. This is a clear gap.

---

## 8. Disposition / tag taxonomy

Hustle splits "disposition" across two mechanisms:

**Lead actions** (per-goal disposition) [19]:
- Marked by agents/admins/managers as the contact's response to a goal: documented examples are **Yes** and **No** ("Yes, No, et al."). The "Yes" action specifically feeds the Reminders workflow [19]. The full default set beyond Yes/No is Unknown – not found.
- For VAN Survey goals, the disposition surface becomes the VAN question's own response options as radio buttons (e.g. Yes / No / Maybe / Strong support / Undecided) [10].

**Tags** (contact categorisation) with three visibility levels [11][16]:
- **Contact profile** (default) – info agents collect about a contact, e.g. **donor**, **volunteer** [16].
- **Opt-out reason** – applied when an agent opts a contact out, e.g. **wrong number**, **moved** [16][21].
- **Admin eyes only** – visible only in the admin panel.

Governance: tags are created in the admin panel only; agents cannot create tags in the mobile app and can apply only Contact-profile and Opt-out-reason tags [16]. Tags can map to VAN **activist codes, survey responses, and canvass results** [16].

There is no published fixed canvass-style result-code taxonomy (Home/Not Home/Refused/Moved) inside Hustle – disposition is whatever Yes/No lead actions plus org-defined tags the admin configures, with canvass-result semantics borrowed from VAN.

---

## 9. Pricing & access model

Two models [22] (note a source conflict on the PAYGO setup fee):

- **Pay-as-you-go (PAYGO):** platform fee of **$250** per hustle.com pricing page [22]; multiple secondary sources cite **$100** [14][17] – treat the exact figure as Unknown / changed over time. Plus **$0.04 per SMS segment** outbound, no long-term commitment [22].
- **Annual commitment:** from **$10,000/year**, adding priority support, a dedicated Client Success Manager, volume SMS discounts, short-code access, and the Hustle Stories feature [22].

Included with any plan: 10DLC and compliance support, full platform access (P2P, broadcast, video, dialer), free incoming messages/calls/media, and no hidden carrier or 10DLC registration fees [22].

Not published / Unknown: per-seat or per-agent pricing (no evidence of seat licensing – billing is consumption-based on segments), MMS and calling rates, free trial (a comparison source says there is **no free trial** [14]), and minimum volumes.

Access model: agents log in via web or mobile apps; roles are Organisation Admin, Manager (group- or inbox-scoped), and Agent [15][19].

---

## 10. Strengths & gaps

**Strengths:**
- Mature, compliant P2P texting at scale (FCC P2P definition, 10DLC, TCPA, short codes) with claimed 98% open rates and 1B+ conversations [2][3][4].
- Conversational video (Clips, Personalized Clips, Stories) is a genuine differentiator [2][6].
- Clean agent workflow model (Initial / Reply / Reminders) with batching to pace outreach and keep replies manageable [19].
- Script system with merge variables, a reusable library, and agent-created personal scripts [7][8][20].
- Deep, native NGP VAN / EveryAction sync for tags → activist codes / survey responses / canvass results, plus opt-out sync [11][16].
- VAN Survey goal turns survey capture into fast radio-button agent UX [10].

**Gaps:**
- **No canvassing/door-knock** capability at all – no walk lists, maps, turf, or offline field app [12][14].
- **No true journey/sequence automation** – only single-step keyword auto-replies and a one-hop Reminders workflow [9][17].
- **No shared team inbox**; agent-owns-contacts model, weaker for pooled real-time triage [17].
- **Narrow integration set** (≈VAN, Salesforce, Blackbaud); limited deep real-time CRM sync [14][17].
- **No email**, no voice broadcast, limited calling feature depth (single dialer, no recording/monitoring/branching call scripts) [14].
- **VAN survey constraints**: one question per goal, most-recent-only sync, can't target on survey response [10].
- **Opaque pricing** for MMS/calls and inconsistent published setup fee; no free trial [14][22].
- US-only compliance posture; no evidence of international/Australian support [3][13].

---

## 11. What uprise should borrow / avoid

**Borrow:**

1. **Tag visibility tiers.** Hustle's three-level model (contact-profile / opt-out-reason / admin-only) is a clean, copyable governance pattern. uprise should adopt the same tiering and apply it identically in both the door and text interfaces so a shared tag means the same thing on both surfaces.
2. **Survey-as-canned-response coupling.** The VAN Survey goal's trick – response options auto-generate radio buttons *and* pre-seed a response-script slot for each answer – is exactly the "script/survey drives canned responses in both interfaces" pattern uprise is targeting. Build one survey object whose answers generate both (a) the door disposition buttons and (b) the matching text canned reply.
3. **Initial / Reply / Reminders workflow split.** A crisp model for agent state. uprise can extend it so a door "not home" or a text "Yes, interested" both feed the same Reminders/follow-up queue around the shared contact.
4. **Reusable script library with merge variables and admin-vs-agent scopes.** Admin-authored canonical scripts plus agent-private supplements is a sensible balance of consistency and flexibility.
5. **Lead-action disposition tied to follow-up.** The "mark Yes → flows into Reminders" linkage is the seed of a journey; uprise should make every disposition (door or text) a journey trigger.

**Avoid / do better:**

1. **Don't outsource the door↔text coupling to a third-party CRM.** Hustle only unifies field and text data *inside VAN*, not inside its own product. uprise's whole thesis is a shared contact across door and text – make that a first-class native object, not a VAN side-effect.
2. **Don't ship single-step automation and call it journeys.** Hustle's "Keywords & Automations" plus one-hop Reminders is not a sequence engine. uprise should build genuine multi-step, time-delayed, cross-channel (door + text) journeys with branching on disposition.
3. **Don't skip a shared team inbox.** Hustle's agent-owns-contacts model blocks pooled triage. uprise should support both assignment *and* a shared queue, especially since door visits and text replies about the same contact need to land in one place.
4. **Avoid one-question-per-survey and most-recent-only result limits.** uprise should let a script/survey carry multiple questions and preserve full response history per contact across both channels.
5. **Be transparent on pricing and offer a trial.** Hustle's opaque MMS/call rates, inconsistent setup fee, and no-trial posture are friction uprise can win on.

---

## 12. Sources

- [1] https://hustle.com/ – Hustle homepage (platform overview, channels, apps)
- [2] https://hustle.com/ + product copy – channels, video suite, 98% open rate, 1B+ messages
- [3] https://hustle.com/fcc-faq/ – FCC FAQ, manual-dial / P2P compliance definition
- [4] https://hustle.com/resource/accelerate-voter-engagement-through-relational-organizing-with-peer-to-peer-communication/ – relational organising framing
- [5] https://hustle.com/resource/accelerate-voter-engagement-through-relational-organizing-with-peer-to-peer-communication-2/ – relational organising framing (2)
- [6] https://hustle.com/person-to-person-texting-platform/ – P2P product detail, agent assignment, scripts, video, analytics
- [7] https://help.hustle.com/hc/en-us/articles/360038562074-How-do-I-write-scripts – initial vs response scripts, variables, segment limits
- [8] https://help.hustle.com/hc/en-us/articles/115000597394-How-do-I-use-custom-fields – custom fields for targeting, personalisation, hidden fields
- [9] https://help.hustle.com/hc/en-us/articles/23617709400983-How-do-I-use-Keywords-and-Automations – keyword-triggered automations, MMS
- [10] https://help.hustle.com/hc/en-us/articles/360008899153-Group-Goal-type-VAN-Survey – VAN Survey goal, radio buttons, sync constraints
- [11] https://help.hustle.com/hc/en-us/articles/115000522894-How-do-I-use-the-VAN-Every-Action-Integration – VAN/EveryAction integration, opt-out sync
- [12] https://en.wikipedia.org/wiki/Hustle_(company) – history, founders, acquisitions, employee ownership, no canvassing
- [13] https://hustle.com/fcc-faq/ – 10DLC / TCPA compliance posture
- [14] https://callhub.io/alternatives/callhub-vs-hustle/ – feature gaps, integrations, pricing, "no relational organizing"
- [15] https://help.hustle.com/hc/en-us/articles/115002089853-What-are-the-types-of-Group-Goals – six group goal types
- [16] https://help.hustle.com/hc/en-us/articles/115000522914-How-do-I-sync-Hustle-Tags-to-NGP-VAN-Activist-Codes-and-or-Survey-Questions- + tag visibility article – tags → VAN activist codes / survey responses / canvass results
- [17] https://textus.com/blog/hustle-vs-ez-texting – strengths, weaknesses, no shared inbox, limited automation, pricing
- [18] https://hustle.com/resource/digital-campaigning-tools-for-simplified-and-more-meaningful-political-organizing/ – texting as complement to door canvassing
- [19] https://help.hustle.com/hc/en-us/articles/115000523034-Glossary-of-Hustle-terms – goal, lead, agent, manager, segment, workflow, lead action
- [20] https://help.hustle.com/hc/en-us/articles/360041822833-How-do-I-use-the-script-library – script library reuse
- [21] https://help.hustle.com/hc/en-us/articles/115001688553-How-can-I-record-an-opt-out-reason- – opt-out reason tags
- [22] https://hustle.com/pricing/ – PAYGO and annual pricing, inclusions
