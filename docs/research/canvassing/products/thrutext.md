# ThruText (GetThru) – Product Dossier

_Research date: 16 June 2026. Australian English. Primary sources: getthru.io, help.getthru.io. Secondary: Capterra, G2, NTEN._

ThruText is the peer-to-peer (P2P) texting product from **GetThru** (formerly "Get Through" / GetThru.io). It is the closest direct peer to uprise' P2P SMS inbox. GetThru also sells **ThruTalk** (P2P phone dialling); the two share one admin account, pricing model, and help centre but are separate products [1][9]. This dossier focuses on ThruText.

---

## 1. Positioning

- **Who it's for:** Progressive political campaigns, advocacy/non-profit organisations, and education/university/alumni teams. GetThru states "our roots are in progressive politics" and serves 1,000+ organisations [2][6].
- **Geography:** Primarily United States. Pricing, compliance (10DLC, TCPA) and integrations (VAN, EveryAction, ActionKit) are US-centric. International pricing is "by inquiry" only [1][7][11].
- **Electoral vs advocacy:** Both, with electoral as the historical core. The deepest integration is with **VAN/EveryAction** (the dominant US voter-file / campaign CRM), which signals an electoral-first design. Advocacy/non-profit use cases (fundraising, event recruitment, surveys, member mobilisation) are explicitly marketed [2][6].
- **Track record (vendor claim):** 1,000+ organisations; 1 billion+ texts and 750 million+ calls sent across the suite; 200M+ messages since 2016 [4][6].

---

## 2. Full product scope

ThruText is a **volunteer-driven (or staff-driven) outbound conversation engine** with data collection and CRM sync. Core scope [1][2][3][8][10]:

- **Contact list upload** ("Groups") with custom merge fields; automatic landline/non-textable number scrubbing.
- **Campaigns** – the unit of work (a "text bank"): one contact list + initial message script + survey questions + assigned senders.
- **Scripts** with per-recipient merge fields (name, custom fields).
- **Messenger** – the texter interface for sending initials and handling replies.
- **Recommended Replies** (admin canned responses) and **My Replies / Saved Replies** (texter-personal canned responses), global or per-campaign.
- **Survey Questions** – four types (Yes/No, Multiple Choice, Checkboxes, Freeform) for structured data capture.
- **Reply automations** – auto-send a recommended reply when a contact responds a certain way (lightning-bolt icon).
- **Follow-up campaigns** – manual re-messaging of segments filtered by survey response or non-response.
- **Assignment + Self-Assignment** – admin distributes conversations, or texters pull their own batches.
- **Opt-out handling** – keyword-triggered auto opt-out plus manual opt-out, with a global opt-out reply.
- **MMS** support.
- **10DLC brand/use-case registration** built into onboarding.
- **Two-way VAN / EveryAction / ActionKit integration** (survey questions, activist codes, canvass results, events, "Texted"/"Canvassed" contact history).
- **Data export** at group, campaign or account level.
- **Targeting/segmentation** – include/exclude multiple groups, target on prior campaign data.
- **Campaign analytics** (campaign details/summary page).
- **Tags** – organisational labels on campaigns (admin housekeeping, not contact dispositions).

What it is **not**: a marketing/broadcast SMS tool, a true workflow-automation/drip platform, or a door-knocking app (see §3, §7).

---

## 3. Canvassing / door-knock UX

**ThruText does not do door-knocking.** There is no walk-list, map, route, or in-person canvasser app. It is purely a texting product.

Its relationship to canvassing is **data-level, through VAN**, and this is the most relevant pattern for uprise:

- ThruText treats a completed text conversation as a **canvass-type contact attempt** in VAN. VAN must have a canvass type "Text" and a result code "Texted" configured [12][13].
- When an initial message sends from a VAN-integrated campaign, ThruText writes a **"Texted"** contact-history result to the linked voter record [13].
- If a **VAN-integrated survey question is answered for that contact on the same day**, the result code is upgraded from **"Texted" to "Canvassed"** with a new timestamp – i.e. answering a survey reclassifies the interaction as a real canvass [11][13].
- An opt-out during the campaign can write **"Do Not Text"** if that result code exists [11].

So ThruText and door canvassing **converge on the same shared contact record in VAN**, not inside ThruText. A texter and a door-knocker (using MiniVAN or VAN's own canvassing tools) update the same voter via VAN's canvass-result / survey-question / activist-code schema. ThruText is one channel feeding that schema; it does not own the canvassing UX.

---

## 4. Data model

**Entities** [8][10]:

- **Group** – an uploaded contact list. Carries name, phone, and arbitrary custom merge fields. To sync, groups must include `van_id` (MyVoters) and/or `van_campaign_id` (MyCampaign) custom fields, mapped at upload (or matched later via vlookup) [11].
- **Campaign** – container for a contact list, script, survey questions, recommended replies, and assigned senders. States: Draft, Active, Paused, Archived [10].
- **Conversation** – the message thread between one sender and one contact within a campaign [10].
- **Survey Question** – Yes/No, Multiple Choice (pick one), Checkboxes (pick many), Freeform (≤2,000 chars). Responses are stored, not sent to the contact [14][16].
- **Tag** – campaign-level organisational label only; **not** a contact disposition [10].

**How outcomes are stored and synced** [11][12][13]:

- Survey responses, activist codes, events and canvass results sync **two-way** with VAN.
- **MyVoters** supports Survey Questions, Activist Codes, **Canvass Results**, Events. **MyCampaign** supports Survey Questions, Activist Codes, Events (no canvass results).
- **Freeform responses do not sync** – they must be manually bulk-uploaded as notes [11].
- **Canvass Results: only the last selected result per contact per day syncs**, though ThruText retains all selections internally [11].
- **Events: only "Yes" RSVPs sync via API**; "Declined" requires manual upload [11].
- "Texted"/"Canvassed" contact history is written automatically while the campaign is open; messages sent via Admin Conversations while a campaign is closed sync once it reopens [13].
- Duplicate same-day initials to the same VAN ID record only log "Texted" once per file per day [11][13].

The key design point: **ThruText's own data model is thin (groups, campaigns, conversations, survey answers, tags), and richness lives in VAN.** The contact-as-shared-record is external.

---

## 5. P2P texting / inbox – detailed

**Conversation model** [10]:

- Each campaign holds many one-to-one threads. A **Conversation** groups all messages between one sender and one contact within that campaign. Conversations are scoped to a campaign, not to a global per-contact timeline – the same person texted in two campaigns has two conversations.
- The first outbound message is the **Initial Message** (from the script). Subsequent admin-sent messages to segments are **Follow-ups** [10].

**Texter workflow (the "Messenger")** [3][8][15]:

1. Texter accepts an invite (email or permanent link) and gets an **assignment** (a batch of conversations).
2. **Send initials:** texter fires the scripted initial message to each contact in the batch (200+ messages/minute claimed) [1][2].
3. **Handle replies:** when a contact replies, the texter reads the thread and responds, using **Recommended Replies** (admin canned) or **My Replies** (personal canned) from the **Replies tab** on the right, or freehand. Canned replies can be edited before sending [3][8].
4. **Survey/tag:** the texter records structured data in the **Survey tab** (right side) – answering one or more survey questions per contact [16].
5. **Opt-out / next:** if the contact asks to stop, the texter opts them out (a global opt-out reply is sent) and moves on [3].

**Assignment of conversations to volunteers** [15]:

- **Admin-assigned:** admin distributes conversations to named senders.
- **Self-assignment (optional, default off):** texters click **"Request Conversations"** to pull a batch from the **Unassigned** pool. Default batch is **300** initial messages (and a further 300 after finishing initials); admin-configurable up to **5,000**. The button only appears once all current initials are sent/hidden/opted out.
- Conversations can be **reassigned** at the campaign level by admins.

**Message queueing:** Sending is texter-driven, not scheduled-drip. The texter clicks through their batch sending initials; the system paces high throughput. There is no time-released automated send queue – cadence is human-paced within open campaign hours/timezones set by admin [3][8].

**Opt-out handling** [3][10][17]:

- **Automatic** opt-out on keyword triggers (STOP/UNSUBSCRIBE etc.).
- **Manual** opt-out by admin or texter.
- A **global opt-out reply** (admin-authored) acknowledges the request.
- GetThru treats opt-out language ("reply STOP to opt out") as best practice and complies with 10DLC/TCPA [17]. Note: under the 2025 TCPA "any reasonable means" guidance, keyword-only detection is increasingly considered insufficient industry-wide – relevant for uprise' own opt-out NLP design [17].

---

## 6. Survey & script tooling

**Scripts** [8][10]:

- A **Script** is the initial-message template, with per-recipient merge fields. One script per campaign for the initial; admins can clone campaigns to reuse setups.

**Canned responses** [3][8]:

- **Recommended Replies** – admin-created, shown to all texters in the Replies tab; each has a title + body; searchable, reorderable (drag-and-drop), editable live without pausing; can be **global** (across campaigns, globe icon) or campaign-specific. Some can be set to **auto-send** based on contact response (lightning icon).
- **My Replies / Saved Replies** – texter-created personal snippets, global or per-campaign, inserted with a "+", editable before send.

**Surveys/questions/tags** [14][16]:

- Four question types: Yes/No, Multiple Choice (single-select radio, cannot be deselected – GetThru recommends adding an "Undecided" option as a workaround), Checkboxes (multi-select), Freeform (≤2,000 chars, manual save).
- **Global Surveys** can be created once and reused across campaigns.
- "Tags" in ThruText are **campaign organisation labels**, not contact tags. Contact-level "tagging" is effectively done via survey answers and (in VAN) activist codes.

**Reusable across channels?** Within GetThru, scripts/surveys are **not natively shared between ThruText and ThruTalk** – they're built per product. Cross-channel reuse happens **only via VAN**: VAN survey questions and activist codes can be pulled into both a ThruText campaign and a phone/door canvass, so the *same VAN question* drives data capture in text and on the doors. ThruText itself has no door interface to share a script with. This is the integration-mediated reuse model, not native shared scripting [11].

---

## 7. Journeys / engagement ladders

**ThruText has no journey / sequence / drip engine.** There is no native multi-step, time-delayed automated nurture flow [confirmed by absence across vendor pages 2][6].

What it offers instead:

- **Follow-up campaigns** – admins **manually** create a new send to a segment (e.g. survey-yes responders, or non-responders), and can time reminders (the help guidance suggests ~3 days before an event) [8]. This is manual re-targeting, not automated journeys.
- **Reply automations** – a single-step auto-reply when a contact answers a certain way; not a multi-stage ladder [3].

The "ladder" is operated by humans across separate campaigns, with VAN/EveryAction holding the longitudinal record. Anyone wanting true automated sequences runs them in EveryAction or a separate automation tool, not ThruText.

---

## 8. Disposition / tag taxonomy

ThruText has **no rich internal disposition codes** for contacts. Its taxonomy is split three ways:

1. **Conversation status (implicit):** active reply, hidden, opted-out. No "not home / refused / moved" door-style codes exist (it's texting).
2. **Survey responses** – the real per-contact data: admin-defined answer sets per campaign (e.g. support 1–5, attending Yes/No, volunteer interest). These are the de-facto dispositions.
3. **VAN result codes (the canonical outcome taxonomy), written by sync** [11][13]:
   - **Texted** – initial message sent (canvass type "Text").
   - **Canvassed** – Texted + a VAN-synced survey question answered the same day (upgrades the result).
   - **Do Not Text** – on opt-out (if the result code exists in VAN).
   - Plus any **Activist Codes** and **Survey Question** answers chosen by the org in VAN.

**"Tags"** in ThruText UI = campaign-organisation labels only, not result/contact dispositions [10].

So the actual disposition vocabulary is **owned by VAN**, with ThruText emitting Texted/Canvassed/Do-Not-Text and survey/activist-code values into it.

---

## 9. Pricing & access model

Pay-as-you-go, no long-term contract, no minimum on the PAYG tier [1][7][11]. Campaign-segment pricing (getthru.io/getthru-pricing-campaigns) [7]:

- **ThruText SMS:** **6¢ per message** (one SMS segment); **3.5¢ per additional segment**; **6¢ per MMS**.
- **Setup fee:** **$300** (credited back at $5k spend on the campaigns page; an older NTEN sheet and other pages cite a lower/$100 setup and 8¢/message pay-as-you-go, so the setup fee and per-message rate have **changed over time and vary by segment/contract** – treat current published campaign rate as 6¢ + $300) [5][7][9].
- **Free trial:** 1 month, up to **100 outgoing messages** [9].
- **Volume discounts:** contracted rates at volume; campaigns page references a **$10k commitment** threshold for discounts; bulk tiers begin around 100,000 messages/month [7][9].
- **Managed service add-on:** ~**5¢ per message** [7].
- **ThruTalk (calling), for context:** **4.5¢ per dial**, connected minutes free, $300 setup [7][9].

Access model: SaaS web app; admins invite texters by email/permanent link; texters need only a browser (mobile/tablet supported in Messenger). 10DLC brand registration required before sending [3][8].

> Note: GetThru publishes segment-specific pricing pages (campaigns / education / non-profits) and exact rates live in each org's contract; figures above are the published campaigns rate and may differ for non-profit/education [7][9].

---

## 10. Strengths & gaps

**Strengths**

- **Throughput and reliability** – 200+ msgs/min, high uptime, mature at scale (1B+ texts) [1][2][4].
- **Deep two-way VAN/EveryAction sync** – the gold-standard electoral integration; Texted→Canvassed upgrade logic is genuinely clever [11][13].
- **Self-assignment** – elegant volunteer scaling without admin bottleneck [15].
- **Canned-reply ergonomics** – admin Recommended Replies + personal My Replies + auto-send replies, all searchable/draggable in one panel [3][8].
- **Simple, learnable** – consistently praised for ease of use and 7-day support [2][9].
- **Compliance-aware** onboarding (10DLC, opt-out) [3][17].

**Gaps**

- **No canvassing/door UX at all** – relies entirely on VAN as the shared layer.
- **No native journeys/automation** – follow-ups are manual; only single-step reply auto-send exists [6][8].
- **Thin internal data model** – contact richness and disposition taxonomy live in VAN, not ThruText; freeform answers don't even sync [11].
- **No native cross-channel shared scripts/surveys** between ThruText and ThruTalk – reuse is VAN-mediated only [11].
- **Conversation is campaign-scoped, not contact-scoped** – no unified per-person inbox/timeline across campaigns [10].
- **US-only orientation** – VAN-centric; weak fit outside US voter-file ecosystems [7][11].
- **Survey UX rough edges** – radio answers can't be deselected; "Undecided" workaround [14][16].

---

## 11. What uprise should borrow / avoid

**Borrow**

- **Texted→Canvassed result upgrade.** uprise wants door + text coupled on a shared contact. ThruText's pattern – a contact attempt is "lightly touched" (Texted) until a survey answer upgrades it to a full "Canvassed" – is exactly the **shared-disposition logic uprise should own natively** across both door and text, instead of outsourcing it to VAN. Build this as a first-class, channel-aware outcome model.
- **Three-tier canned responses:** admin shared/recommended + personal saved + single-step auto-reply, all in one searchable panel, editable before send, global-or-per-campaign. This directly informs uprise' "canned responses driven by the same script/survey in both door and text interfaces."
- **Self-assignment with configurable batch size** – great for scaling volunteers without admin micromanagement; applies equally to door turf and text batches.
- **Reusable global surveys + four question types** (Yes/No, single, multi, freeform) as the shared data-capture primitive across channels.
- **Opt-out as a first-class action with a global acknowledgement reply.**

**Avoid / improve on**

- **Don't make conversations campaign-scoped.** uprise should make the **contact the spine**: one per-person timeline that shows door visits, text threads, surveys and journey state together. ThruText's biggest structural weakness for a coupled door+text product is that it has no unified per-contact view.
- **Don't outsource the data model to VAN.** Own dispositions, surveys and the contact graph natively so uprise works without a voter file – then sync to VAN/external CRMs as an export, not a dependency. (Note freeform-doesn't-sync as the cautionary tale.)
- **Don't ship manual-only follow-ups.** uprise' "journeys" are the explicit differentiator. Build true multi-step, condition-triggered sequences (survey answer → wait → text → if no reply → door visit task) – the thing ThruText conspicuously lacks.
- **Make scripts/surveys genuinely cross-channel from day one** – one script/survey object that drives canned responses and data capture in *both* the door app and the text inbox. ThruText only achieves this accidentally via VAN; uprise should make it native.
- **Improve survey UX:** allow de-selecting single-choice answers (no "Undecided" hack); sync all answer types including freeform.

---

## 12. Sources

- [1] GetThru – ThruText P2P texting product page: https://www.getthru.io/p2p-thrutext
- [2] GetThru – ThruText for nonprofits: https://www.getthru.io/p2p-texting-nonprofits
- [3] GetThru Help – Getting Started with ThruText: https://help.getthru.io/support/solutions/articles/44001908443-getting-started-with-thrutext
- [4] GetThru – homepage: https://www.getthru.io/
- [5] NTEN – GetThru 2020 pricing sheet (historical): https://word.nten.org/wp-content/uploads/2021/03/2020-Pricing-Final-Text.pdf
- [6] GetThru – P2P texting campaigns page: https://www.getthru.io/p2p-texting-campaigns
- [7] GetThru – Campaigns pricing: https://www.getthru.io/getthru-pricing-campaigns
- [8] GetThru Help – admin/texter workflow (getting started, surveys, follow-ups): https://help.getthru.io/support/solutions/articles/44001908443-getting-started-with-thrutext
- [9] GetThru pricing search summary (Capterra/help pricing guides): https://www.capterra.com/p/10017834/GetThru/
- [10] GetThru Help – ThruText Glossary: https://help.getthru.io/support/solutions/articles/44002170759-thrutext-glossary
- [11] GetThru Help – Integrating ThruText campaigns / syncing to VAN: https://help.getthru.io/support/solutions/articles/44001063792-sync-responses-integrating-your-thrutext-campaigns
- [12] GetThru Help – VAN Surveys and Activist Codes for ThruText: https://help.getthru.io/support/solutions/articles/44001782018-sync-responses-survey-questions-activist-codes
- [13] GetThru Help – ThruText syncs "Texted" status to VAN: https://help.getthru.io/support/solutions/articles/44001782021
- [14] GetThru Help – Tips for creating Survey Questions: https://help.getthru.io/support/solutions/articles/44002134972-tips-and-tricks-for-survey-questions
- [15] GetThru Help – Self Assignment: https://help.getthru.io/support/solutions/articles/44001063778-using-self-assignment
- [16] GetThru Help – Collect Data with Survey Questions in your assignment: https://help.getthru.io/support/solutions/articles/44001063872
- [17] GetThru Help / TCPA 10DLC opt-in & opt-out guidance: https://help.thrutext.io/support/solutions/articles/44002267101-10dlc-and-opt-ins
- [18] GetThru Help – Recommended & Saved Replies: https://help.getthru.io/support/solutions/articles/44001063880
