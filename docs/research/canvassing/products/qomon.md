# Qomon – Product Dossier

Research date: 2026-06-16. Prepared for the yarns canvassing + P2P texting platform.

Qomon (qomon.com) is a modern "Supporter Activation Platform" combining a CRM, a field/mobile organising app (canvassing, phone banking), communications (email, broadcast SMS), events, petitions/forms, fundraising and mapping. Originally French (Paris), now Paris + Washington D.C. based, certified B Corp, serving 1,500+ organisations across 70+ countries [1][2][7].

---

## 1. Positioning

- **Who it's for.** Five named segments: political parties & movements; campaigns & elected officials; nonprofits & associations; advocacy organisations; unions & federations [2]. So it spans both electoral and advocacy use, not one or the other.
- **Geography.** Operates in 70+ countries; dual HQ in Paris and Washington D.C.; deliberately expanding from French/European roots into the US and international markets [1][2]. Census/electoral data layers exist for mapping, implying jurisdiction-specific data packs [2].
- **Electoral vs advocacy.** Genuinely both. Marketing leans on electoral language (voter lists, GOTV, win numbers, "25 million door-knocks, 13 million calls annually") but the segment list and "nonprofit/advocacy/union" framing make it a dual-use organising platform [2][6]. It positions as either a full replacement ("Unify" program) or an "activation layer" connecting to existing tools ("Activate" program) [2].
- **Scale claims.** 500 million contacts managed, 180,000+ active volunteers, 25M door-knocks, 13M calls per year [2].

---

## 2. Full product scope

From the homepage and product navigation [2]:

**Action & engagement**
- Door-to-door canvassing app (mobile)
- Phone banking / calling software
- Mobile field app with real-time sync (iOS + Android)
- Events Hub
- Petitions & surveys
- "Flows" / Action Flows automation (beta)
- Supporter amplification / "Sharing" action (the closest thing to P2P texting – see §5)

**CRM & data**
- Action CRM (the contact/citizen relationship manager, "AI-augmented")
- Donor CRM
- Duplicate management
- Tasks & interactions
- Volunteer management

**Fundraising**
- Donor CRM, Tap to Give (new), donation pages (coming soon), multichannel fundraising, membership cards. Note: reviewers flagged fundraising as historically weak, with a fuller suite launching ~March 2026 [10].

**Communications**
- Email platform
- SMS/MMS (broadcast, not P2P – see §5) [9]
- Forms

**Analytics & intelligence**
- Advanced mapping
- AI Action Bar (coming soon)
- Donor & voter intelligence
- Census & electoral data layers

**Platform**
- Public API ("API Hub"), thousands of integrations, Zapier, SSO, decentralised/"central-local" action structure, personalisation [2][10].

---

## 3. Canvassing / door-knock UX (detailed)

This is Qomon's strongest area and the most relevant reference for yarns.

**Setting up a canvassing action (organiser side)** [4 (create-action article)]. Three creation paths:
1. From scratch (Actions tab > Create Action > Canvassing).
2. From the contact database (filter contacts, then create the action from the selection).
3. From the Maps tab (select/draw an area on the map, then create a canvassing action from it).

Territory ("turf") is defined three ways:
- **Selected Area** – includes database contacts *plus* unmapped addresses in the zone; volunteers can add new contacts on the app.
- **My Selected Contacts** – only existing database contacts/addresses.
- **Streets Without Contacts** – deliberately targets streets your database doesn't cover; volunteers create contacts in the field.

Zones can be chosen by street, by city, or by drawing boundaries directly on the map [4]. Configuration also covers: action name, photo, description; a meeting point / starting location; start and end dates; an action leader; talking points and links; and an attached survey. Volunteers are assigned manually, by team, or via **AI Team Assignment** that matches volunteers to actions by availability and proximity [3][4]. On creation, assigned volunteers get a push notification + email and see the action in the mobile app [4].

**Volunteer canvassing flow (mobile)** [Help: canvassing-action-on-your-mobile-app]:
1. Open assigned action under the HQ tab, mark attendance ("I'm attending"), slide to start.
2. Choose **list view** (low battery, simple) or **map view** (visualises addresses, more battery).
3. App shows addresses from the contact database; volunteer navigates with turn-by-turn directions.
4. At the door, first prompt is the contact status (see §8).
5. If present and consenting, the attached survey opens automatically; volunteer collects responses + contact details (email, phone).
6. Address autocompletion lets volunteers correct/complete addresses on the fly.
7. After the interaction, volunteer adds follow-up and next steps; data syncs to HQ "instantly and securely".
8. Green "+" button adds contacts not on the original list (with address autocomplete).

**Map / route UX details** [canvassing-app-best-features blog]:
- Turf viewable as map or list, with turn-by-turn directions.
- **Suggested paths that cluster nearby contacts** – route optimisation to cut backtracking.
- Organisers **pre-assign areas** so each canvasser starts knowing their patch.
- Geo-mapping **highlights target addresses and shows skipped doors** for later follow-up.
- Real-time dashboard updates as doors are knocked / conversations logged; organisers can tweak messaging mid-shift.
- In-field tagging ("cares about climate", "donated $50") that later filters by district/interest/support level back at HQ.
- Survey answers link back to contact profiles and dashboards in real time.

**Offline mode** [Help: offline-mode]. Enabled per-device via Profile > Settings > Offline Mode toggle. Volunteer must confirm attendance, then download the action (shows "Available offline"). Offline, they can complete surveys and update contact/address info. **Critical limitation: the canvassing map is NOT available offline** – only list-based work functions without signal. On reconnect, tap "Reconnect" and queued data syncs automatically.

---

## 4. Data model

Reconstructed from CRM help articles and product pages [2][CRM help collection][8].

- **Contacts.** Unlimited customisable fields on a contact card. Core attributes include tags, support level, postcode/address. Tags are free-form and used for segmentation/targeting [8].
- **Support levels.** A qualification scale categorising a contact's relationship to the org (configured at Profile > Space Settings > Contacts/CRM > Support Levels). Customisable; can reset to defaults. **The exact default labels are not published** – Unknown, not found.
- **Addresses / geo.** Contacts carry addresses; the CRM does **Contact Geolocation & Mapping** to visualise concentration with dynamic map views and filters [2]. Canvassing turf can include addresses with *no* contact yet ("Streets Without Contacts"), so addresses are first-class enough to canvass without a linked person, and volunteers create the contact in the field [4].
- **Interaction history.** Every action, edit and communication (email, SMS, push) is retained against the contact; tasks/follow-ups attach too [8][2]. This is the key linkage: door and call outcomes write back to the unified contact record in real time.
- **Survey responses.** Each answer links to the contact profile and to dashboards [best-features blog]. Survey results, support levels and tasks are also importable/exportable and creatable via API/Zapier [Zapier listing].
- **Deduplication.** Duplicate Management exists but is a noted weak point; imports flag duplicates for manual keep/discard, and reviewers report "ghost contact" entries instead of updates and slow imports on large datasets (hundreds of thousands of contacts) [8][10].
- **Storage / sync.** Cloud CRM with real-time field-to-HQ sync; offline capture queues locally and syncs on reconnect (map excluded offline) [3][offline help].

---

## 5. P2P texting / inbox

**Important for yarns: Qomon does NOT have a true P2P texting inbox.** There are two distinct messaging capabilities and neither is a two-way conversational inbox:

1. **Broadcast SMS/MMS** [9]. One-way mass messaging to filtered contact lists. The first 11 characters of your chosen name appear as the sender. An automatic "STOP SMS" footer is appended for compliance (removable only for informational messages). An "Optimize" button strips problematic special characters. The help docs make **no mention of two-way replies, a conversation/inbox view, or reply management** – it is send-and-report only.

2. **"Sharing" / supporter amplification action** [P2P texting blog; share-action help]. This is what Qomon *calls* peer-to-peer, but it is relational broadcast, not 1:1 texting: an organiser drafts a message and assigns it to volunteers, who then share it with their own networks via their phone's native SMS, plus Facebook, X/Twitter, Slack, Instagram, email, etc. Recipients get it from a known person (the trust mechanic), but there is no inbox, no reply threading, and Qomon does not host the conversation.

**Relationship to canvassing.** Messaging is a *downstream next step* from canvassing, not coupled to it. After a door or call interaction, the volunteer/organiser can queue follow-up emails (automatic, response-triggered) and SMS, and trigger automatic SMS during actions [SMS auto help][4]. But there is no shared conversational surface where a door interaction and a text thread live together. **This is precisely the gap yarns is built to fill.**

There is also an **automatic SMS** feature that fires SMS during actions based on triggers, and email automation triggered by survey responses/status/opportunities [4][SMS auto help].

---

## 6. Survey & script tooling

**Surveys** [Help: create-a-survey]. Built from sections + questions. Eight question types: Checkbox, Date, Numeric, Photos, Range, Short Answer, Signature, Single Response. Four default templates are provided and customisable. **Conditional questions** (Qomon's term for skip logic) display follow-ups and create branching paths based on answers. Publishing makes a survey "instantly available on the mobile app."

**Cross-channel reuse.** Surveys are the shared data-collection layer across actions: they "launch automatically as part of a canvassing or calling action," and can be started manually from the mobile app via "Start a survey" [create-a-survey]. Advanced/Expert plans allow **multiple surveys, each linked to a specific action** [create-a-survey][Help: using-multiple-surveys]. So the same survey object can drive both door and phone interactions – good precedent for yarns' goal of one script/survey across door + text. Online/web forms exist as a separate "Forms" product, but the help docs primarily describe surveys surfacing on the mobile app rather than confirming the identical survey object renders in a public web form.

**Scripts / talking points.** Lighter than the survey tooling. Canvassing actions carry "talking points and links" attached at action setup [4]. There is **no evidence of a structured scripted-conversation engine with canned responses** the way a P2P texting tool would have (no documented branching script with reply snippets). The calling action references "going through your survey" rather than a separate script object. **Canned responses as a first-class, reusable, cross-channel object: Unknown, not found** – Qomon leans on surveys + talking points, not a canned-response library.

---

## 7. Journeys / engagement ladders

**Action Flows** (automation, beta / early-access) [Flows blog; beta program]. Trigger-based sequences: when someone signs a petition, attends/RSVPs an event, submits a form, or joins a list, Qomon can automatically send the next action, message or form. Marketed explicitly as turning "an individual action into an ongoing journey" to move supporters up the ladder (supporter → volunteer → donor). Once designed, the workflow runs autonomously.

Maturity caveat: this is **beta / coming-out-of-beta** as of the 2025 Autumn/Winter release [Flows blog]. The simplest live form of automation today is response/status-triggered **automatic emails and SMS** off survey answers and action outcomes [4][SMS auto help]. So the journey concept exists and is being productised, but it is newer and less mature than the canvassing engine.

---

## 8. Disposition / outcome taxonomy

Qomon uses small, fixed outcome sets per channel, then layers qualitative data (support level, tags, survey) on top.

**Canvassing (at-door status)** [canvassing mobile help; status search]:
- **Present**
- **Absent**
- **Refusal** (refuses to speak)
- **Come back later**

If Present + consent → survey opens. After the survey, the volunteer can skip qualification or return to assign a **support level** and/or **tasks**, and response/status can trigger an automatic follow-up email [canvassing help][4].

**Calling (call outcome)** [Help: calling action]:
- **Accepted**
- **No answer**
- **Refused**
- **Other** (e.g. call back later, invalid phone number)

So the "hard" disposition is a 4-way status; the richer signal lives in **support level** (configurable qualification) + **tags** + **survey responses**, all written back to the contact. There is no large GOTV-style canvass disposition matrix exposed publicly; the model is deliberately minimal at the door and pushes nuance into the survey/tags.

---

## 9. Pricing & access model

Pricing is **not transparently published** as full tiers; the public pricing page routes to a demo/quote flow [pricing page]. Best available figures (treat as approximate, secondary-sourced):

- **Usage / "pay-as-you-grow" model**, entry around **$39/month (Starter)** and **~$99/month (Premium, which adds canvassing)** per secondary sources; GetApp lists a starting price of **$49/month, usage-based** [pricing search][GetApp]. The discrepancy ($39 vs $49) reflects shifting/region-specific pricing – treat exact entry price as **approximate**.
- Starter reportedly includes the CRM (all CRM features) + mobile app access; canvassing sits in higher tiers; multiple-surveys gated to Advanced/Expert plans [pricing search][create-a-survey].
- **Free trial / free version:** conflicting reports – GetApp says a free trial and free version exist; other sources say no free trial. **Treat as Unknown / verify with Qomon directly.**
- Ratings context: Capterra 4.9/5 (34 reviews), ease-of-use 4.9, customer service 4.7 [10].

Access is SaaS, web dashboard for organisers + iOS/Android app for volunteers, with SSO and a public API/Zapier for integration [2][10].

---

## 10. Strengths & gaps

**Strengths**
- Fast, low-friction field deployment – a reviewer went from sign-up to voter-list upload to door-knocking "within 24 hours" with 50+ volunteers [3][10].
- Genuinely good canvassing UX: map + list, route clustering, drawable turf, "streets without contacts", offline capture, real-time HQ dashboard, AI team assignment [3][4][best-features blog].
- Unified contact record – door/call outcomes, surveys, tags, support levels and comms history all attach to one contact in real time [2][8].
- Surveys are reusable across canvassing and calling, with conditional logic [create-a-survey].
- Strong ease-of-use reputation and volunteer adoption; API-first; B Corp credibility [1][10].

**Gaps**
- **No true P2P texting inbox** – SMS is broadcast; "P2P" is share-to-your-network amplification, not 1:1 conversation management [9].
- **Map unavailable offline** – a real field limitation in low-signal areas [offline help].
- Automation ("Flows") and fundraising are newer/beta and historically weak [10][Flows blog].
- Deduplication and large-scale import quality are recurring complaints (ghost contacts, slow imports, no self-serve import revert) [10].
- Filtering/search UX has a learning curve; help docs incomplete [10].
- No documented structured canned-response / scripted-conversation library [calling help; create-a-survey].

---

## 11. What yarns should borrow / avoid

**Borrow (especially canvassing UX & maps):**
1. **Three turf-definition modes.** "Selected area (incl. addresses with no contact)", "my selected contacts", and "streets without contacts" is an elegant model – it lets canvassers work known supporters *and* cold streets in one action, creating contacts in the field. yarns should treat addresses as first-class, canvassable without a pre-existing contact.
2. **Map ↔ list toggle with an explicit battery trade-off.** Qomon tells volunteers map view costs more battery and offers list view as the default work surface. yarns should ship both and make list-mode fully functional (Qomon's map being offline-unavailable is a *gap to avoid* – yarns should cache map tiles for true offline maps).
3. **Suggested paths clustering nearby contacts** + turn-by-turn. Cheap route optimisation that materially raises doors/hour.
4. **One survey object that auto-launches in multiple actions** (door + call). This is the cross-channel reuse yarns wants; extend it so the *same* survey/script also drives the P2P text inbox with canned responses – the thing Qomon does NOT do.
5. **Minimal hard disposition + rich soft data.** A 4-button door status (Present/Absent/Refusal/Come back later) plus support level + tags + survey is fast at the door and analytically rich. Don't over-engineer the disposition matrix; push nuance into tags/survey.
6. **Real-time write-back to a unified contact timeline** so a door knock, a call and a text all land on one contact record.
7. **AI/proximity team assignment** as a planning-time accelerator.
8. **Action Flows model** for journeys: action (sign/RSVP/door survey answer) triggers next message/action. Good shape for yarns "journeys."

**Avoid / improve on:**
- **The messaging gap is yarns' wedge.** Qomon's "P2P" is broadcast/share, with no inbox or reply threading. yarns' differentiator is a real 1:1 conversational inbox that is *coupled to* the canvass – e.g. a "Come back later" or "Absent" door outcome should be able to drop the contact into a P2P text thread with the same script/canned responses. Make the door→text handoff a single tap.
- **Offline map.** Don't repeat Qomon's "map not available offline" limitation; cache tiles.
- **Dedup/import quality.** Invest early in deduplication and reversible imports; Qomon's biggest operational complaint.
- **Don't gate multi-survey behind premium tiers** if shared scripts are core to your value prop.
- **Build a real canned-response library** (scripted conversation with reusable reply snippets) that works in *both* the door and text interfaces – Qomon has talking-points + surveys but no structured canned-response object, which is exactly your stated requirement.

---

## 12. Sources

- [1] https://qomon.com/ – Supporter Activation Platform (positioning, scale, B Corp, HQ)
- [2] https://qomon.com/ + product nav / https://qomon.com/product/crm – full product scope, segments, CRM/geo, programs
- [3] https://qomon.com/solutions/door-to-door-app – canvassing app features, offline, AI assignment, sync
- [4] https://help.qomon.com/en/articles/3675350 (redirects to) http://help.qomon.com/en/articles/3675350-how-to-create-a-canvassing-action-with-qomon – turf modes, action setup, surveys, auto-email
- https://help.qomon.com/en/articles/6799753-canvassing-action-on-your-mobile-app – volunteer door flow, statuses, views
- https://qomon.com/blog/canvassing-app-best-features – map/list, route clustering, skipped doors, dashboard, tagging
- https://help.qomon.com/en/articles/10985150-offline-mode-download-your-actions – offline download/sync, map-offline limitation
- https://help.qomon.com/en/articles/3095867-create-a-survey-on-qomon – question types, conditional logic, cross-action reuse
- https://help.qomon.com/en/articles/4383599-using-multiple-surveys – multiple surveys per action (Advanced/Expert)
- https://help.qomon.com/en/articles/6799512-how-to-use-the-calling-action-as-a-volunteer – call outcomes, support levels
- [8] https://help.qomon.com/en/articles/7018872-how-to-mass-modify-my-contacts-in-qomon + CRM collection – fields, tags, dedup
- https://help.qomon.com/en/articles/3203400-how-to-use-and-modify-support-levels – support levels (defaults not published)
- [9] https://help.qomon.com/en/articles/3595424-faq-s-sending-an-sms-through-qomon – broadcast SMS, sender, STOP footer, no inbox
- https://qomon.com/blog/ways-to-leverage-peer-to-peer-texting-for-your-movement + https://help.qomon.com/en/articles/4100696-how-to-use-the-share-action-on-qomon – "Sharing" amplification action
- https://help.qomon.com/en/articles/6485616-how-to-use-the-automatic-sms-feature – automatic SMS in actions
- https://qomon.com/blog/the-2025-qomon-autumn-winter-release + https://help.qomon.com/en/articles/10470805-qomon-beta-early-access-program – Action Flows / automation (beta)
- [pricing] https://www.getapp.com/marketing-software/a/qomon/pricing/ + https://qomon.com/book-your-free-demo-pricing-page – pricing (usage-based, ~$39–$99/mo, quote-driven)
- [10] https://www.capterra.com/p/180100/Qomon/reviews/ – ratings (4.9/5, 34 reviews), strengths and gaps
- https://zapier.com/apps/google-forms/integrations/qomon/ – survey results/support levels/tasks via API/Zapier

Notes on unconfirmed items: default support-level labels (not published); exact entry price and free-trial availability (conflicting secondary sources); whether a single survey object renders identically as a public web form (surveys documented on mobile app; Forms is a separate product). All marked inline where relevant.
