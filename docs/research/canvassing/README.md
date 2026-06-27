# Canvassing + P2P texting – product research corpus

Direction-setting research for a **door-knocking (canvassing) domain in uprise,
intelligently coupled with the P2P texting inbox**, with shareable script/survey
tooling driving canned responses in both interfaces and "journeys" (engagement
sequences) for contacts.

This is durable reference material for future implementation – not an
implementation plan. The actionable next step lives in
[`uprise-direction.md`](./uprise-direction.md).

Date compiled: 2026-06-16.

## How to read this

1. [`synthesis.md`](./synthesis.md) – start here. Capability matrix across all
   11 products plus the cross-product patterns for the four things uprise cares
   about (door↔inbox coupling, shared scripts, shared surveys, journeys) and a
   recommended disposition taxonomy.
2. [`uprise-direction.md`](./uprise-direction.md) – the findings mapped onto uprise'
   actual schema and code, the one foundational change (a persistent Contact
   spine), the proposed shared layer + canvassing domain, and the forks to settle
   before building.
3. `products/*.md` – the per-product dossiers with citations.

## Products covered

Advocacy-weighted broad sweep.

**US electoral standard-setters**
- [NGP VAN / MiniVAN](./products/ngpvan-minivan.md) – the canvassing standard;
  shared survey/activist-code layer; no native P2P inbox.
- [ThruText](./products/thrutext.md) – P2P texting; couples to canvassing only
  via VAN sync.
- [Hustle](./products/hustle.md) – P2P texting; no native canvassing.
- [Impactive](./products/impactive.md) (now ActBlue Field Tools) – texting +
  relational canvassing on a shared script/contact model.
- [Reach](./products/reach.md) – relational, search-first; shared authoring but
  no conversation inbox (cautionary tale).
- [Spoke](./products/spoke.md) – open-source P2P texting; valuable
  interaction-step / data-model lessons.

**Advocacy / intl / Australia-relevant**
- [Action Network](./products/action-network.md) – ladders of engagement (the
  journeys analogue); canonical question model; already integrates with uprise.
- [CallHub](./products/callhub.md) – calling + P2P texting + a real Workflows
  automation engine; canvassing only via Ecanvasser.
- [Qomon](./products/qomon.md) – strong canvassing/map UX; no P2P inbox.
- [Ecanvasser](./products/ecanvasser.md) – offline-first canvassing; no native
  texting/journeys.
- [OutreachCircle](./products/outreachcircle.md) – cross-channel around a shared
  contact; shallow field ops.

## Method

One cited research pass per product (web search + primary-source fetch, claims
verified against at least one source; unconfirmed items marked
"Unknown – not found" rather than guessed). Each dossier follows the same
12-section template (positioning, full scope, canvassing UX, data model, P2P
inbox, scripts/canned responses, surveys, journeys, dispositions, pricing,
strengths/gaps, what uprise should borrow/avoid, sources). `synthesis.md` and
`uprise-direction.md` were written from the verified dossiers.

Australian English; en-dashes throughout.

## How to extend

- New product: add `products/<slug>.md` using the 12-section template, then add a
  row to the matrix in `synthesis.md` and a bullet above.
- Re-verify: dossiers are point-in-time (note Impactive's 2026 ActBlue
  acquisition/rebrand). Re-fetch primary sources before relying on pricing or
  feature specifics.
