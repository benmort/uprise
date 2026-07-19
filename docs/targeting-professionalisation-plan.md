# Targeting professionalisation plan

**Status:** proposed · **Owner:** Ben · **Date:** 19 July 2026 · **Horizon:** Victorian state election (November 2026) + the cycle beyond

The SA1 targeting heat map now runs in production: nine weighted factors over G-NAF doors, AEC 2025
booth results (mark-off-attributed), ABS demographics, polls and canvass returns, with per-SA1
explainability and preset weights. This plan sets out how it becomes a professional-grade targeting
practice — new data, the process between campaigns, and reporting — grounded in the field-experiment
literature (Gerber/Green, Kalla/Broockman, Analyst Institute), vendor practice (Catalist, TargetSmart,
VAN) and Australian data/legal reality (s91B, the APPs, AEC/VEC/ABS publishing).

The through-line from the research: **professionalism is not more factors — it is provenance,
honest measurement, and institutional memory.** Pew's audit found no US voter-file vendor publishes
decile-level calibration; Catalist's credibility rests on publishing methodology and exclusions.
That gap is ours to take.

---

## 1 · Legal spine (do this first — it gates everything else)

Non-party organisations are **not** covered by the Privacy Act's political exemption. A recorded
support level is *sensitive information* (political opinion) under APP 3 — collecting it from a
doorknocked stranger requires consent, and a lawful cross-campaign supporter file requires an APP 5
collection notice and an APP 11.2 retention schedule.

- **Consent capture on the disposition pad** (a per-ID consent flag + one-line verbal script),
  shipped before the Victorian canvass scales. Without it, tenants' supporter files don't survive
  legal scrutiny between campaigns.
- **Retention schedule = the decay engine** (§3): the same mechanism that retires stale IDs
  satisfies APP 11.2. One build, two obligations.
- s91B (no roll access) is permanent for our users — it is also the moat: the consent-based
  supporter file tenants build here is the only person-level asset they can lawfully hold.

## 2 · New data sources (ranked by value ÷ effort)

| # | Source | What it adds | Effort |
|---|--------|--------------|--------|
| 1 | **VEC 2022 results by voting centre** — 88 districts, one predictable `.xls` per district + 2CP HTML pages | The RIGHT base layer for Vic 2026: state-level competitiveness + informality instead of federal proxies. No mark-off file exists, so allocate voting centres→SA1 by catchment (k-NN IDW fallback already built) and report observed-vote share | ~1 day ETL |
| 2 | **AEC 2022 + 2019 votes-by-SA1** + ABS `CG_SA1_2016_SA1_2021.csv` correspondence (population-weighted ratios + quality flag) | Three election time-points per SA1 → a **swing/trend factor**; the correspondence quality indicator rides into explainability | ~2 days |
| 3 | **AEC enrolment statistics** (annual enrolment *rate* by division + monthly counts + age/sex) | The **enrolment-gap factor** (weight-0 opt-in): division gap disaggregated via the young-renter/CALD lenses we already hold — the one signal that works for enrolment-drive doors with zero roll access | ~1 day |
| 4 | **ABS Regional Population (ERP)** annual, SA2 + Victoria in Future 2023 projections | **Age the 2021 Census lenses**: growth-corridor SA2s are >20% bigger than at Census; scale SA1 door-weights by SA2 growth, badge the ERP vintage | ~1 day |
| 5 | **Seat-level MRP** (YouGov 2025 federal; DemosAU Vic series — free PDFs) | Recalibrate poll-ambivalence priors. Critical for 2026: DemosAU shows One Nation in final pairings — 2022-based 2CP weights will misrank those seats | manual, per release |
| 6 | **ABS Data API** (SDMX, no key) + TableBuilder Pro (free registration) | Automated refresh of standard tables; one bespoke cross-tab pass per cycle (renter × age × language at SA1) | ~2 days once |
| 7 | **G-NAF quarterly refresh** (Feb/May/Aug/Nov) | Scheduled re-load + vintage badge. Skip paid G-NAF Live unless a growth-corridor audit shows real door loss | automation only |
| 8 | **AEC booth coordinates** (GeneralPollingPlaces per event) + **election-night feeds** (AEC Media Feed XML/FTP 90-second; NSWEC feed; VEC has none — request media access before November) | Proper booth catchments; live election-night ingestion for the retrospective | ~2 days |
| 9 | **OSM footpath/intersection density** (ODbL — bonus-only input, never a penalty where unmapped) | Walkability refinement; prefer intersection/crossing density (well mapped) over patchy sidewalk tags | ~2 days |

Explicitly **not** recommended: individual-level uplift models (T/X-learners need ~10k+ randomised
surveyed outcomes — an order of magnitude beyond community-org scale; in simulation they recover
zero true effect-modifiers at n=1,000), and any roll-derived data (s91B).

## 3 · The process between campaigns (the lifecycle)

**Set-up (campaign start)**
- Universe preview before commit (VAN "Preview My Results" pattern): doors / dwellings / SA1s /
  estimated shifts, active suppressions shown inline, before a walklist generates.
- **Evaluation mode at walklist generation**: optionally withhold a randomised holdout — SA1
  clusters pair-matched on prior 2CP + turnout (Arceneaux precinct template; the design that works
  without roll access), or now-vs-later stepped-wedge so no doors are permanently lost. A power
  calculator shows the MDE before launch and warns below ~80 clusters/arm.
- Score run IDs stamped on every walklist/universe at creation (frozen, Saved-List style):
  *which score version drove which turf decision* becomes a join, not archaeology.

**In campaign**
- Weekly five-number dashboard (§4). Two decay curves in the score, not one: **contact-effect
  decay** (weeks — steep, persuasion presets, per Kalla/Broockman) vs **data-validity decay**
  (months–years, keyed to the SA1's renter share: ~4–5yr half-life owner-dominant, 12–18mo
  renter-dominant — straight from ABS mobility data we already hold as a lens).
- For the Treaty program: the panel difference-in-differences design (Broockman/Kalla/Sekhon;
  proven at community scale by People's Action 2020, where **695 deep-canvass conversations**
  measured +3.1pp because panel DiD analyses compliers): letterbox/SMS-to-web panel recruited from
  target SA1s, baseline wave before knocking, placebo arm at walk-list assignment, post wave,
  automated DiD. Outcome: a **multi-item Treaty/anti-racism attitude index** (deep-canvass effects
  are ~10× candidate-choice effects and durable) — powered for 3pp, not 5.

**Election night + after**
- Ingest results (feeds above). **Freeze the pre-election score snapshot** — post-election
  validation must be out-of-sample. Never validate by comparing canvassed high-score SA1s to
  un-canvassed low-score ones: that is the model grading its own homework (Gerber/Green selection
  bias — it does not shrink with n).
- **Post-election retrospective module**: targeted vs pair-matched untargeted SA1 swing;
  knock-density vs booth-swing correlation; per-factor predictive performance; decile calibration
  vs booth results. Output feeds the next cycle's preset weights.

**Between campaigns**
- **Decay + retirement engine**: IDs auto-retire after one cycle unless re-confirmed (= APP 11.2).
- **NCOA wash** via an Australia Post partner (Datawash/Experian) — 12%/yr household churn, 84%
  of movers lodge redirection; update consented movers, suppress the rest.
- **Retraining cadence** (TargetSmart's snapshot regime): mandatory re-score + weight review on
  every official-results ingest; weekly input snapshots in-campaign, annual between, all
  vintage-stamped.
- **Campaign close-out**: archive universes/turfs/score-runs read-only with vintages + one-click
  full export (tenants own their history independent of the subscription — the VAN failure mode,
  avoided by design).
- **Measured-uplift factor** (weight-0 opt-in): empirical-Bayes-shrunk segment effects from the
  cycle's experiments (never raw point estimates — small segments dominate on noise), with n/CI/
  vintage in explainability; prior campaigns' pooled effects become next cycle's prior.
- **Coalition deconfliction** (America Votes model, APP-safe): cross-tenant knock-recency and
  coverage shared only as SA1 aggregates + turf-claim maps — no person-level disclosure.

## 4 · Reporting (three layers)

**Layer 1 — the field dashboard** (weekly review ritual, per turf + per channel; every volume
metric paired with a quality metric):
1. Contact rate (healthy band 30–40%)
2. Identification rate (flag <40% — canvassers skipping the ask)
3. Supporter accumulation trend vs goal
4. Conversation-quality distribution (substantive vs script-delivery)
5. Universe coverage % (stops re-knocking easy turf while hard turf goes untouched)

**Layer 2 — score accountability**
- **Decile calibration report** as a product feature: predicted vs realised supporter-ID rate per
  score decile in-campaign; predicted vs booth swing post-election (out-of-sample, frozen
  snapshot); MAE per decile + top-vs-bottom-decile lift, data vintages printed on the chart. *No
  vendor publishes this — it is the differentiator.*
- **Uncertainty numerically, never generically**: per-SA1 coverage stats and confidence bands.
  The Royal Society evidence: numeric ranges preserve trust in the source; vague "indicative only"
  disclaimers destroy it. (Our value-by-alpha + flags already follow this — extend, don't dilute.)

**Layer 3 — funder-grade program report** (generated from platform data, SDAN norms):
universe definition + targeting logic; doors/attempts/contacts/completes with rates; cost per
contact and per ID; experimental uplift as ITT **and** CACE with 95% CIs, failure-to-treat logged
per attempt; planned vs exploratory analyses labelled; **nulls published**; cost-per-vote only when
experimentally backed — and always paired with Movement-Voter-Project-style power metrics
(volunteer retention, repeat actions) so CPV never stands alone.

**Methodology transparency** (the professional wrapper):
- A versioned **model card** per score release (semver — minor on data refresh, major on
  factor/weight change): factors, preset vectors, intended use, explicit out-of-scope uses
  ("not individual-level inference — no roll data under s91B"), validation results, Catalist-style
  named exclusions. Superseded versions stay public; SVI-style "don't compare across versions".
- **One-page datasheets per source** (Gebru pattern): G-NAF, AEC mark-off, SEIFA, CALD, renter,
  polls, canvass returns — with dbt-style freshness states (fresh/stale/expired) per declared
  threshold, surfaced as the vintage badges already in explainability.
- **Release notes** on every refresh: what landed, which factors moved, expected drift — this
  changelog *is* the institutional memory.
- **External methodology review** before the campaign peaks: an Australian political-science or
  social-statistics academic reviewing the *weighting choices*, not just the maths (the Allegheny
  lesson), published in full, with a documented organiser-override path. Longer term: co-author a
  methods paper (the Flanagan/Ghitza–Gelman anchor-paper play) and quality statements in ABS Data
  Quality Framework vocabulary — the language Australian institutions already trust.

## 5 · Phasing against November 2026

**Phase 1 — now (July–August)**: consent capture + APP 5 notice (legal gate); VEC 2022 ETL +
state-results competitiveness/informality; universe preview + evaluation-mode holdouts + power
calculator; run-ID stamping; five-number dashboard; MRP recalibration of poll priors.

**Phase 2 — September–October**: panel DiD experiment live (Treaty attitude index, placebo arm);
decile calibration (in-campaign IDs); funder report generator; model card + datasheets +
methodology page; external review commissioned; enrolment-gap factor; ERP lens aging;
pre-election snapshot freeze; VEC media-feed access secured (or scraper ready).

**Phase 3 — November–December**: election-night ingestion; post-election retrospective
(targeted-vs-matched swing, per-factor performance, out-of-sample calibration); publish the
"What Happened" report — nulls included.

**Phase 4 — between campaigns (2027)**: decay/retirement engine + NCOA wash; close-out/archive/
export; retraining cadence + snapshots; measured-uplift factor with EB shrinkage; 2019/2022
votes-by-SA1 back-history + swing factor; coalition deconfliction; ABS API automation + G-NAF
quarterly refresh.

## Runbook: MRP seat-prior recalibration (Phase 1.7 — manual, per release)

When YouGov or DemosAU publish a new MRP round (DemosAU posts free PDFs; YouGov publishes per-seat
estimates with credible intervals): ingest the seat-level primary/2PP estimates into
`insights.PollEstimate` rows (`geoKind` sed/ced, `geoCode` from `geo.sed`/`geo.ced`, `reportable`
true, `baseN` from the published effective n) via the existing poll import path; then refresh
affected campaigns' heat (the reference-data watermark rotates the cache). Watch for changed 2CP
pairings — where One Nation reaches the final two, 2022-based competitiveness misranks and the MRP
prior should carry more weight. Cadence: on every published Victorian round through November 2026.

## Verification

Each phase lands through the standard gates (typecheck, api tests + boot smoke, coverage patch
≥80%, isolated builds) plus feature-specific proof: evaluation-mode assignment logged immutably and
reproducible from the run ID; calibration report reproduces hand-computed deciles on a fixture
campaign; the retrospective module validated against the 2025 federal results already loaded (score
a boundary on 2022-era inputs, test against 2025 booth swing); consent flag round-trips
disposition → supporter file → export.
