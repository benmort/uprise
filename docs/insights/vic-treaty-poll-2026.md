# YouGov Victorian Treaty poll (Common Threads, June–July 2026)

Reference documentation for the poll ingested into the Insights/Polling domain
(`insights.Poll` / `PollQuestion` / `PollEstimate`). It describes what the source
data contains, what the crosstabs reveal, how it joins to uprise's geography, and
the reporting caveats. This is prose reference — the machine-readable data lives in
the `insights` schema and is loaded by `insights:load-vic-treaty-poll`.

## Overview

- **Commissioner:** Common Threads (uprise tenant `common-threads`).
- **Fieldwork agency:** YouGov (YouGov Galaxy Pty Ltd).
- **Scope:** Victoria (state).
- **Sample:** n = 4,003.
- **Fieldwork:** 16 June – 9 July 2026.
- **Method:** online panel, **weighted**. All figures are **weighted column percentages**
  unless stated. Column base sizes ("Column n") are shown per crossbreak column.
- **Topic:** attitudes to Victoria's statewide Treaty with First Nations people,
  set against state voting intention, issue salience and party competence.
- **Source files:** `YouGovcomonthreadssummary09072026.pdf` (1-page key findings) +
  `CommonThreads_VICPoll_Jun26_Tables_09JUL26V2.xlsx` (crosstab tables, 6 sheets:
  `Front Page`, `Background`, `TOC`, `Polling background B1-C3`, `Treaty questions C4-E5`,
  `Open ended minor party vote`).

## Question catalogue

Codes are the source's own. `NET` rows are collapsed summaries YouGov provides
(e.g. NET Support = Strongly + Somewhat support).

**Voting & party (sheet: Polling background B1-C3)**
- **B1** — State primary vote, if a Victorian election were held now (Coalition /
  One Nation / Labor / Greens / Independent / Other). *Headline: Coalition 26, One
  Nation 24, Labor 23, Greens 13, Independent 5, Other 9.*
- **B2** — Why chose that first preference (reasons).
- **B3** — Parties/candidates would seriously consider voting for (multi-select).

**Issues & competence**
- **C1** — Most important issue facing Victoria (ranked). *Treaty ranks 12th; economy
  and crime lead.*
- **C3_1 … C3_12** — Which party is best at handling each of 12 issues: economy &
  finances, wages vs prices, public hospitals & health, funding schools, the CFMEU
  construction scandal, housing affordability, protecting the right to work,
  environment & climate, energy prices & fuel security, crime & community safety,
  road & rail projects, and **a Treaty with First Nations people**. *Coalition rated
  best on economy & crime; Treaty competence is "don't know"-heavy.*

**Treaty core & argument testing (sheet: Treaty questions C4-E5)**
- **C4** — Awareness of Victoria's Treaty (aware / heard something / not aware).
- **C5** — Support/oppose the statewide Treaty (Strongly/Somewhat support · Neither ·
  Somewhat/Strongly oppose · **NET Support / NET Oppose**). *Total: 40 support, 32
  oppose, 28 neither.*
- **D1–D5** — Pro-Treaty argument statements tested for agreement (self-determination,
  freedom to decide, valuing all people, fairness & dignity, honesty about history).
- **D6** — Which statement is the strongest / weakest reason (ranked). *Top reasons:
  "everyone deserves fair treatment" 48%, "values all people" 47%.*
- **D7–D10** — Counter-argument statements (divisive / too costly / undemocratic /
  what would opponents do).
- **E1** — Response after hearing arguments for and against (NET Support / NET Oppose).
  *Total: 40 support, 35 oppose — the movement measure vs C5.*
- **E2** — A candidate who said "scrapping the Treaty within 100 days" — in touch or
  out of touch with your priorities. *58% out of touch.*
- **E3** — Which party would make the "scrap the Treaty" statement. *63% say it reads
  as a One Nation policy.*
- **E4** — Have you experienced or witnessed racism (First Nations / migrants /
  multicultural). *45% overall; higher among younger and tertiary-educated voters.*
- **E5** — Less likely to vote for a politician who made racist statements. *74% less
  likely.*

**Open-ended (sheet: Open ended minor party vote)** — verbatim "another party"
responses for B1 and the Upper House question (Victorian Socialists, Family First,
Animal Justice, Legalise Cannabis, etc.).

## Crossbreaks (19 groups)

Every question is tabulated against these columns. Column indices are the xlsx
column positions (0-based) of the crossbreak-group header row on the data sheets —
useful for the ingest parser, which reads the group spans from the sheet's merged
cells (`!merges`).

| Group | Cols | Geographic? | Values |
| --- | --- | --- | --- |
| Total | c1 | – | Total |
| Gender | c2–c4 | – | Male, Female, Other (n=11 — unreportable) |
| Age | c5–c11 | – | 18-24, 25-34, NET 18-34, 35-49, 50-64, 65+, NET 50+ |
| State voting intention | c12–c17 | – | Labor, Coalition, Greens, PHON, Independent, Other |
| Federal voting intention | c18–c24 | – | …+ Don't know |
| 2025 Federal election vote | c25–c31 | – | …+ DNV |
| 2023 The Voice Vote | c32–c34 | – | Voted Yes, Voted No, DNV |
| Generations | c35–c39 | – | GenZ, Millennials, GenX, Boomer, Silent |
| **VIC Upper House Electorate** | **c40–c47** | **YES → `geo.sed_upper` (VIC)** | Eastern Victoria, Northern Victoria, Western Victoria, North-Eastern Metropolitan, Northern Metropolitan, South-Eastern Metropolitan, Southern Metropolitan, Western Metropolitan |
| Region | c48–c51 | No (not a geo layer) | Inner Metropolitan, Outer Metropolitan, Provincial, Rural |
| Parental status | c52–c54 | – | children <18, children 18+, neither |
| Working status | c55–c58 | – | Full time, Part time, Retired, Other |
| Household income | c59–c62 | – | <50k, 50-99k, 100-149k, 150k+ |
| Household income (2 groups) | c63–c65 | – | <100k, >100k, PNS/DK |
| Highest Education | c66–c68 | – | Up to Year 12, TAFE/College, Tertiary |
| Other spoken languages | c69–c70 | – | Other language at home, Only English |
| House tenure | c71–c73 | – | Own outright, Mortgage, Rent |
| House type | c74–c77 | – | Unit/Flat, Detached/Semi, Terrace/Townhouse, Other |
| Class | c78–c80 | – | Well off, Middle Class, Working Class |
| B3 consideration | c81–c86 | – | Labor, Lib/Nat Coalition, Greens, One Nation, Independent, Another party |

## What the crosstabs reveal

**Region-level estimates are directly reportable.** The 8 Legislative Council
regions carry solid base sizes (n ≈ 449–569 each), well above the suppression
threshold — so region-level numbers can be shown without modelling.

**Treaty support is map-ready today.** Treaty NET support (C5) by LC region:

| LC region (`geo.sed_upper`) | NET Support | NET Oppose | Base n |
| --- | --- | --- | --- |
| Northern Metropolitan | 60% | 20% | 569 |
| Southern Metropolitan | 45% | 25% | 502 |
| Western Metropolitan | 44% | 27% | 475 |
| North-Eastern Metropolitan | 38% | 34% | 500 |
| South-Eastern Metropolitan | 35% | 34% | 522 |
| Western Victoria | 35% | 36% | 489 |
| Eastern Victoria | 32% | 39% | 497 |
| Northern Victoria | 30% | 42% | 449 |
| **Total** | **40%** | **32%** | **4003** |

This joins 1:1 to `geo.sed_upper` polygons (by region name → code) and drives the
Insights choropleth. The post-argument measure (E1) shows the same rank order with
small net movement.

**Other actionable signals:**
- **Argument effectiveness** — D6 identifies the strongest reasons ("fair treatment",
  "values all people"); the C5→E1 shift measures persuasion after hearing both sides.
- **The "Liberal = One Nation" framing** — E2 (58% say "scrap in 100 days" is out of
  touch; ~61% in Southern Metropolitan) and E3 (63% read scrapping the Treaty as a
  One Nation policy).
- **Competence & salience** — C1 (Treaty ranks 12th) + C3 (Coalition leads on economy
  & crime; Treaty is "don't know"-heavy) frame where Treaty sits in the issue mix.
- **Racism attitudes** — E4/E5 (45% witnessed racism; 74% less likely to back a racist
  politician).

## Geographic join

- **"VIC Upper House Electorate" → `geo.sed_upper` (Victoria)**, 1:1 by region **name**.
  The 8 names above match the derived `geo.sed_upper` rows for Victoria (the 8
  Legislative Council regions). The ingest resolves name → `geo.sed_upper.code` and
  stamps `geoKind = "sed_upper"`, `geoCode` on those estimate rows.
- **Legislative Assembly districts** (88 lower-house seats) = `geo.sed_lower` (Victoria).
  The poll does **not** break down to this level; it is the **MRP** target (below).
  The estimate store already supports it via `geoKind = "sed_lower"` — no schema change
  when the modelled estimates arrive.
- **"Region" (Inner/Outer Metro, Provincial, Rural)** is a coarse YouGov band, **not** an
  ABS/electoral layer. Stored as an ordinary crossbreak (`geoKind = null`); shown in
  crosstabs, excluded from maps.

## Reporting caveats

- All percentages are **weighted**; base sizes ("Column n") accompany every column.
- **Suppress small bases** — do not report a cell whose base is below the threshold
  (e.g. gender "Other", n=11). The store flags each cell `reportable`.
- Display whole percentages; NET rows are YouGov-provided summaries.
- **Licence / attribution** — YouGov data used for internal, organiser-only display.
  Every surface must credit: *"YouGov · commissioned by Common Threads · fieldwork
  16 Jun–9 Jul 2026 · n=4,003 · weighted."*

## The poll's own open questions

From the summary PDF, still to be resolved by Common Threads:
1. **Who is the audience** for the report (which electorates/segments it maps to).
2. **Which three questions to model with MRP** to produce per-Legislative-Assembly-
   district (`geo.sed_lower`) estimates — the subject of a separate follow-on plan.
