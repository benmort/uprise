# OutreachCircle – Product Dossier

Research date: 2026-06-16. Sources are listed at the end and cited inline as [n]. Where a claim could not be confirmed against a source it is marked "Unknown – not found".

OutreachCircle (originally VoterCircle, rebuilt and renamed in 2019) is a supporter-engagement, relational-organising and peer-to-peer texting platform. It was acquired in January 2021 by PDI / Political Data Inc., a 30-year voter-data and campaign-tooling firm, and is now sold and supported under PDI [8][9][16]. Note: the live product UI (`client.outreachcircle.com`) is a JavaScript single-page app that does not render to static fetchers, so much of the detail below comes from the Zendesk help centre, PDI's product blog, app-store listings and the marketing blog rather than the running app.

---

## 1. Positioning

- Who it's for: campaigns, advocacy groups, membership organisations, labour unions and nonprofits. Post-acquisition, PDI states OutreachCircle's clients are "mainly large advocacy groups", while PDI overall serves 1,000+ progressive candidates and causes [9][14].
- Geography: US-focused. PDI is "California's largest provider of voter information" and the combined company is expanding nationally; voter-file matching, NGP VAN integration and US disposition conventions all point to a US-only footprint [9]. No evidence of Australian, UK or international deployments – Unknown – not found.
- Advocacy vs electoral: both, with a deliberate dual posture. The platform leans progressive/Democratic via PDI's client base, and supports electoral (GOTV, voter registration, persuasion) and year-round advocacy/membership organising (unions like SEIU 2015, League of Women Voters' "League in Action") [3][7][14].
- Core thesis: relational organising – "friends reach out to friends via email, text, or social media" – on the premise that contact from a known person outperforms cold stranger contact for both turnout and persuasion [1][5][12].

## 2. Full product scope

Confirmed capabilities:

- Supporter recruitment and management – sign-up flows, a supporter "Action Hub", tagging, segmentation, and assignment of staff/volunteer leaders to follow up [1][6][13].
- Relational outreach – supporters upload/connect their personal address book; real-time mapping matches those contacts against a target list, voter file or membership database [1][5][12].
- Actions framework – admins build discrete "Actions" that supporters complete and/or push to their friends. Documented action types include Survey Friends, Contact & Survey (Friends and List variants), P2P Texting, plus share/register/volunteer/donate/watch-video actions [4][10][11].
- Peer-to-peer ("Affinity P2P") texting – two-way texting from supporters' own numbers, with a P2P script editor and attachable surveys [7][11][18].
- Contact & Survey – unified relational + list outreach across texting, calling, email and in-person canvassing, each action carrying one survey and one sample script [10][11].
- Surveys – short, customisable-answer surveys attachable to actions and texts; native survey builder plus VAN survey reuse [4][17].
- Mapping/targeting – real-time address-book-to-file matching; community mapping for distributed organising [1][5][12].
- Integrations – two-way NGP VAN / EveryAction sync; New/Mode multi-channel actions surfaced in the Action Hub; historical EveryAction, Phone2Action, YouTube and Facebook embeds [1][8][13][14]. VAN sync reliability has been criticised in reviews (see Gaps) [15].
- Ladder-of-engagement tooling – Groups, unique tracking links that auto-tag/route supporters, segmented reminder emails, nudges [13].
- Fundraising/donor tools, event calendar, volunteer management, staff management, online payments, contribution tracking, campaign analytics, demographic data access [14].
- Mobile apps – iOS and Android, including an "all-in-one canvass action" workflow [10].
- Reporting/analytics – conversion tracking, action completion, supporter activity [13][14].

## 3. Canvassing / door-knock UX

OutreachCircle does have in-person door canvassing, but it is framed as one channel inside the broader "Contact & Survey" action rather than a standalone MiniVAN-style turf product.

- Channel choice per contact: a Contact & Survey action lets supporters "meet your community where they are" via "texting, calling, email, or in-person canvassing". The supporter "chooses how they want to reach out to each contact – whether they'd rather knock on doors, make phone calls, or send texts or emails" [10][11]. This is the architecturally important pattern: one action, one contact list, multiple interchangeable channels.
- Two list models: relational "Contact & Survey Friends" (the supporter works their own matched address book) and "Contact & Survey a List" (admin assigns a pre-built list of contacts) [10][11].
- Shared collateral: "Every Contact & Survey action includes a survey and a sample script for your supporters to use" – the same survey/script serves door, phone and text [10][11].
- Mobile "all-in-one canvass action": Android release notes reference an "improved workflow for all-in-one canvass action", indicating the door-knock experience lives in the native app [10].
- Maps/turf/routing: real-time mapping matches contacts to files, and "community mapping" supports distributed organising [1][5][12]. However, detailed turf-cutting, route optimisation, walk-list ordering or offline-map specifics are Unknown – not found. The depth here appears well below dedicated canvassing tools (MiniVAN, Ecanvasser, Qomon, Knockbase), and OutreachCircle's positioning treats door-knocking as relational/list outreach rather than precinct-walk operations.

## 4. Data model

- Contacts/supporters: two populations – supporters (people who join an OutreachCircle and take/share actions) and contacts/voters (targets, sourced from voter files, uploaded lists, or supporters' matched address books) [1][5][12].
- Address-book matching: supporters' personal contacts are matched in "real time … in seconds" against a target file, voter file or membership database; the matched overlap becomes the supporter's relational outreach list [1][5][12].
- Addresses/geo: addresses arrive via the voter file/list; mapping matches and (for canvassing) locates contacts. Granular geo schema, lat/long capture or address-standardisation detail is Unknown – not found.
- Dispositions: stored as structured codes split into contact and non-contact sets (see §8) and attached to canvass/contact attempts [11].
- Survey responses: short surveys with customisable answer options; responses are recorded against the contact and can be pulled from/written to VAN surveys [4][11][17].
- Storage/sync: two-way NGP VAN / EveryAction integration is the spine for moving contacts, survey responses and outreach results between OutreachCircle and the campaign's voter database [1][14]. Per-channel opt-out is scoped per-OutreachCircle: a STOP message or an applied opt-out tag opts that number out of that OutreachCircle only, leaving the voter contactable via other OutreachCircles [search/help: P2P Texting Actions]. Underlying schema/retention specifics are Unknown – not found.

## 5. P2P texting / inbox

- Affinity P2P texting: supporters send "rapid personal texts" from their own phone numbers; an admin uploads a list of names + cell numbers and a sample message, and supporters personalise before sending [7][18].
- Conversation handling: documented as two-way, with replies handled in-platform; scripts can branch based on responses, and surveys can be attached so answers are captured mid-conversation [help: P2P Texting Actions][7]. Exact inbox UX (threading, queueing, assignment dashboard) is thinly documented – Unknown – not found beyond "assigned numbers to text".
- Assignment: supporters self-assign to a P2P action via a "Copy Link"/"Copy Action Link", or admins assign lists [help: P2P Texting Actions][7].
- Opt-out: STOP messages and an opt-out tag remove a number, scoped to the single OutreachCircle [help: P2P Texting Actions].
- Relationship to other actions: P2P texting is one action type alongside Contact & Survey. The more integrated cross-channel pattern is Contact & Survey, where texting sits beside door/phone/email under one shared survey+script (see §3). Whether P2P-texting conversations and door dispositions for the same contact roll up into one unified contact timeline is Unknown – not found.

## 6. Survey & script tooling

This is OutreachCircle's strongest cross-channel idea for uprise.

- Shared survey + script per action: every Contact & Survey action bundles one survey and one sample script that supporters reuse regardless of whether they knock, call, text or email [10][11]. One authored artefact, many channels.
- Survey builder: native builder for short, single-question surveys with customisable answer options; you can also reuse an existing VAN survey instead of building new [4][17]. Multiple response/answer types exist (e.g. join-OutreachCircle links and other response types) [4].
- Script editing: a dedicated P2P Script Editor for texts, with writing tips and the ability to attach a survey to the script [7][18]. Contact & Survey actions ship a "sample script" supporters can use or adapt [10][11].
- Message templates: when creating actions you "Select/Compose" email and text messages, choosing a pre-made template or composing your own [4].
- Canned/suggested responses tied to survey answers (i.e. an answer auto-suggesting the next message) are not explicitly documented – Unknown – not found. The reuse story is "shared script + shared survey across channels", not necessarily "survey answer drives canned reply".

## 7. Journeys / engagement ladders

- Ladder of engagement: explicitly supported. Admins build progressions from low-commitment asks (watch a video, share on social) up to higher asks (attend an event, volunteer, donate), tailored to supporter type [13].
- Mechanics: "Groups" for large-scale personalised organising; unique tracking links that auto-tag and route supporters into segments; segmented email lists for customised reminders; personalised nudges; and assignment of staff/volunteer leaders to follow up with specific supporter categories (endorsers, partners, donors) [13].
- Automation depth: this is closer to tag-driven segmentation + manual follow-up assignment + reminder emails than a true trigger-based, time-delayed automated drip/journey builder. No evidence of a visual multi-step automation canvas with branching delays – Unknown – not found. Treat "journeys" here as semi-manual engagement ladders, not full marketing-automation sequences.

## 8. Disposition / outcome taxonomy

Confirmed structure: dispositions are organised into named code sets, at least one for contacts made and one for non-contacts.

- Non-Contact Disposition Code Set – "contains all of the non-contact responses you can include in your canvassing tool, such as: Not Home, Bad Number, Gated, etc." [11].
- Confirmed non-contact codes: Not Home, Bad Number, Gated (list is explicitly non-exhaustive – "etc.") [11].
- A corresponding contact/positive disposition set is implied by the "Non-Contact" naming, but the specific contacted-outcome codes (e.g. Supportive / Undecided / Refused / Moved) are Unknown – not found.
- Codes are reused across the canvassing tool and presumably the other Contact & Survey channels, consistent with PDI's VAN-style disposition conventions [11].

## 9. Pricing & access model

- Free plan: yes, a free tier exists [2][14].
- Entry paid: from US$30/month [2][14].
- Named tier: a "Silver Plan" at US$150/month (or US$900 for 6 months) is referenced in search results – moderate confidence, secondary sourcing [2].
- Usage/messaging: usage-based messaging at ~US$0.01 per message [12][14].
- Trial: 15-day trial before the card is charged; downgrade to free within 15 days to avoid a charge [2].
- Enterprise: custom pricing for large orgs; post-acquisition contact runs through PDI (e.g. outreachcircle@politicaldata.com) [2][9].
- Access model: cloud SaaS; web (mobile + desktop browser) plus native iOS and Android apps [10][14].

Note: the live pricing page (`client.outreachcircle.com/plans`) is JS-rendered and did not return figures to the fetcher; the numbers above are from secondary aggregators and should be re-verified against the live page.

## 10. Strengths & gaps

Strengths
- Genuine cross-channel action model: one Contact & Survey action spans door, phone, text and email with shared survey + script, and lets the supporter pick the channel per contact – an unusually clean unification [10][11].
- Relational core: real-time address-book-to-voter-file matching is mature and is the product's reason for being [1][5][12].
- Shared, reusable collateral: survey + script authored once, used everywhere, including VAN survey reuse [4][10][11].
- VAN/EveryAction-native: built for the dominant US progressive data stack [1][14].
- Low, transparent per-message pricing and a real free tier [2][12][14].

Gaps
- Shallow canvassing operations: no documented turf-cutting, route optimisation or robust offline walk-lists; door-knocking is treated as relational/list outreach, not precinct field ops [search; Unknown – not found].
- Thin inbox documentation: P2P conversation/inbox UX is under-described; unclear how well door + text + call outcomes unify into a single contact timeline [Unknown – not found].
- Limited true automation: "journeys" are tag-and-reminder ladders with manual follow-up, not trigger-based drip automation [13].
- Reliability/integration complaints: G2 rating ~2.4/5 (small n=4); reviewers cite a broken Facebook integration that was part of the sales pitch, and VAN API sync discrepancies in contact counts that support couldn't resolve [15].
- US-only, progressive-leaning; no evidence of non-US or non-partisan-neutral deployment [9; Unknown – not found].
- Disposition taxonomy only partially documented publicly (contacted-side codes not confirmed) [11; Unknown – not found].

## 11. What uprise should borrow / avoid

Borrow
- The unified "Contact & Survey" action as the organising primitive. uprise' headline differentiator – door + P2P SMS coupled around a shared contact – maps almost exactly to OutreachCircle's model. Adopt: one action owns one contact list + one survey + one script, and the channel (door/text) is a property of the attempt, not a separate silo [10][11].
- Author-once, use-everywhere survey + script. A single script/survey artefact must render in both the door UI and the text inbox, exactly as uprise intends. OutreachCircle proves the demand and the basic shape; uprise can go further by binding survey answers to canned/suggested responses (the piece OutreachCircle does not clearly do) [4][10][11].
- Channel choice per contact. Letting the volunteer pick door vs text per contact (rather than forcing a campaign-level channel) lowers friction and fits relational organising.
- Split, named disposition code sets (contact vs non-contact). Ship sensible defaults (Not Home, Bad Number, Gated, Moved, Refused, plus a support scale) but make sets editable per campaign, and crucially make the same set valid across door and text so outcomes are comparable [11].
- Tag-driven routing + tracking links as the cheap-but-effective backbone of engagement ladders [13].

Avoid / do better
- Don't ship door-knocking as an afterthought. OutreachCircle's weakness is exactly the field-ops depth uprise is building: real turf-cutting, route ordering, offline maps and reliable sync. This is uprise' opening – make the canvassing feature first-class, not a channel toggle [search; Unknown – not found].
- Make the unified contact timeline explicit. OutreachCircle's docs leave it unclear whether a contact's text thread and door visit reconcile into one history. uprise should guarantee a single contact timeline spanning SMS conversation + door dispositions + journey events, and design the data model around it from day one.
- Build true journeys, not just reminder emails. Differentiate with trigger-based, delayed, branching sequences (e.g. "no door contact after 2 attempts → enqueue P2P text → if positive reply → invite to event"). OutreachCircle stops at tags + manual follow-up [13].
- Get sync rock-solid. The most damaging reviews are about integration/data-accuracy failures, not concept. If uprise syncs to a CRM/voter file, make reconciliation and counts trustworthy and observable [15].
- Close the survey-answer → canned-response loop. uprise explicitly wants survey answers to drive canned responses in both door and text interfaces; OutreachCircle shares scripts/surveys but doesn't clearly wire answers to suggested next messages. This is a concrete, ownable gap.

## 12. Sources

- [1] https://outreachcircle.com/ – OutreachCircle Supporter Platform (marketing).
- [2] https://client.outreachcircle.com/plans – Pricing (JS-rendered; figures via search snippet).
- [3] https://blog.outreachcircle.com/ – OutreachCircle blog index (post list/topics).
- [4] OutreachCircle Help Center – Survey Friends Actions / survey creation (via search snippets): https://outreachcircle.zendesk.com/hc/en-us/articles/360033466252-Survey-Friends-Actions and https://ochelp.zendesk.com/hc/en-us
- [5] https://www.ecanvasser.com/blog/relational-organizing – relational organising context.
- [6] https://ochelp.zendesk.com/hc/en-us/articles/4434144262292-Setting-Up-an-OutreachCircle – Setting up an OutreachCircle (via search).
- [7] https://blog.outreachcircle.com/2019/12/09/affinity-p2p-texting-personalized-peer-to-peer-texting/ – Affinity P2P Texting.
- [8] https://blog.outreachcircle.com/2021/01/13/release-premier-political-data-firm-acquires-supporter-engagement-platform-to-expand-services-and-reach/ – PDI acquisition release.
- [9] https://politicaldata.com/products and PDI/Political Data company pages (via search) – PDI ownership, geography, client base.
- [10] OutreachCircle mobile apps – Google Play (com.outreachcircle.titan) and Apple App Store (id1471980108); release notes referencing "all-in-one canvass action" (via search): https://play.google.com/store/apps/details?id=com.outreachcircle.titan and https://apps.apple.com/us/app/outreachcircle/id1471980108
- [11] PDI blog "New Feature: Contact & Survey in OutreachCircle" (via search snippets; 403 to fetcher): https://politicaldata.com/blog/contact-and-survey/ – Contact & Survey channels, shared survey/script, Non-Contact Disposition Code Set (Not Home, Bad Number, Gated).
- [12] https://cleanprosperousamerica.org/project/relational-organizing/ – relational organising / OutreachCircle overview (via search; mapping + $0.01/msg).
- [13] https://blog.outreachcircle.com/2020/01/20/launching-groups-for-large-scale-personalized-organizing-the-right-ladder-of-engagement-for-each-supporter/ – Groups + ladder of engagement.
- [14] https://sourceforge.net/software/product/OutreachCircle/ – feature list, deployment, pricing, integrations, support.
- [15] https://www.g2.com/products/outreachcircle/reviews – G2 reviews (rating ~2.4/5, n=4; Facebook + VAN sync complaints).
- [16] https://blog.outreachcircle.com/2019/09/04/votercircle-is-now-outreachcircle-why-we-decided-to-start-over-from-scratch/ – VoterCircle → OutreachCircle history.
- [17] OutreachCircle Help Center – survey builder / VAN survey reuse (via search): https://ochelp.zendesk.com/hc/en-us
- [18] https://medium.com/outreachcircle/affinity-p2p-texting-personalized-peer-to-peer-texting-fd031fb7ef02 – Affinity P2P texting (Medium mirror).

Note on method: the OutreachCircle help centre (Zendesk: `ochelp.zendesk.com`, `outreachcircle.zendesk.com`) and PDI blog returned 403/HTTP errors to the automated fetcher; their content was captured via search-engine snippets of those exact articles. The live client app and pricing page are JS-rendered and did not expose content to fetchers. Claims so sourced are flagged where confidence is lower.
