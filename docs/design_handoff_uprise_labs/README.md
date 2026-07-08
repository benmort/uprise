# Uprise Labs — organisation site design handoff

Design reference for **`apps/organisation-marketing`** — the Uprise Labs organisation site
(upriselabs.org). The Labs studio builds Uprise (the product, marketed at uprise.org.au by
`apps/product-marketing`); this site markets the studio itself, agency-style.

## Files

- **`Uprise Labs.dc.html`** — the Claude "design component" prototype (source:
  claude.ai design project *Agency website prototype*,
  `56c28e03-18bf-471a-b56a-d34c975d1a6f`). A single interactive HTML/JS prototype with an
  internal state router covering all 14 screens. Open it in a browser (it loads
  `./support.js` beside it) and click through.
- **`support.js`** — the generated dc-runtime the prototype needs to render. Not used by
  the production app in any way.

## About the design files

The `.dc.html` is a **design reference, not production code**. The task is to recreate the
designs in the `apps/organisation-marketing` Next.js 14 App Router app using its own
Tailwind v4 tokens and small local components — not to port the prototype's runtime.
Prototype-only constructs to translate, never copy: `<x-dc>`, `<helmet data-dc-atomics>`,
`<sc-if>`/`<sc-for>` (→ JSX conditionals/`.map()`), `{{ expr }}` bindings (→ JSX),
`style-hover=`/`style-focus=` pseudo-attributes (→ real CSS `:hover`/`:focus`), and the
`class Component extends DCLogic` script — whose **data blocks (projects, services, posts,
pricing, team, testimonials, docsNav, stats, values, process, capabilities) are the content
source of truth**, lifted into typed modules under `src/lib/data/`.

## Fidelity

- **High-fidelity layout/tokens/motion** — match the prototype.
- **Image slots are deliberate placeholders**: dark `#17140F` blocks with a diagonal-stripe
  gradient and a mono caption like `[ RIVERA FOR SENATE — HERO SCREENSHOT ]`. Build them as
  styled placeholder components; real screenshots/portraits come later.
- **Copy is fictional placeholder** (US-flavoured: "Rivera for Senate", "$180M+ raised",
  `hello@upriselabs.co`, "MADE WITH SOLIDARITY IN THE USA ✊"). Build verbatim, then a
  content pass replaces it with real Australian-English copy and upriselabs.org contact
  details. Code and comments follow the house Australian-English rule regardless.
- **Deliberately NOT the product design system**: no `@uprise/ui` tokens (blue `#465fff`,
  Outfit). The app defines its own theme; `@uprise/ui` is used only for the style-free
  `TurnstileWidget`.
- Prototype simplifications: the case study, service detail, and blog post views each
  render ONE hard-coded instance — the real build templates them by slug
  (`generateStaticParams` over the data modules).

## Design tokens

**Colour**

| Token | Value | Use |
|---|---|---|
| cream | `#F3F0E9` | page background; text on dark |
| ink | `#17140F` | text; dark sections/footer/auth panels; media placeholders |
| vermilion | `#EC4A2B` | accent: CTAs, links/hover, eyebrows, marquee band, selection, cursor, logo dot, active nav |
| vermilion-deep | `#c9351d` | far stop of the radial "floaty" blobs |
| hairline (light) | `rgba(23,20,15,.12)` | 1px borders + hairline-grid gaps on cream |
| hairline (dark) | `rgba(243,240,233,.16)` | 1px borders on ink |
| header veil | `rgba(243,240,233,.72)` + `backdrop-filter: blur(14px)` | fixed header |

Muted text uses ink/cream at various alphas (.4–.72). **No box-shadows anywhere** — depth
comes from dark blocks and the header blur.

**Type**

- **Archivo** (Google Fonts) 400–900 — everything except labels. Headings weight 800 with
  negative tracking (−.02em to −.05em); fluid `clamp()` scale: display H1
  `clamp(44px,7vw,104px)` lh ≈0.95; section H2 `clamp(30px,4vw,54px)`; ledes
  `clamp(24px,3vw,40px)` w500; body 17–19px lh 1.5–1.72; 404 numeral `clamp(120px,22vw,300px)`.
- **JetBrains Mono** 400/500 — every eyebrow, label, tag, meta line, legal, callout
  (11–14.5px, letter-spacing .05–.14em, usually uppercase).

**Layout**: container `max-width:1360px; padding:0 40px`; ~120px section rhythm; page tops
150–168px (clears the 72px fixed header); hairline grids via `gap:1px` + bleed background.

**Radii**: pills/buttons `100px`; cards/media `3–4px`; dots/avatars/blobs `50%`.
Accent left-borders `2px solid #EC4A2B` on quotes. Input style: mono uppercase label,
borderless field with `1.5px` bottom border → orange on focus; textareas fully bordered 4px.

**Motion**

| Keyframe | Behaviour | Used for |
|---|---|---|
| `wipeIn` | orange overlay slides up, holds, exits top (.78s `cubic-bezier(.76,0,.24,1)`) with mono "UPRISE LABS" label | page transition |
| `pageIn` | fade + 12px rise (.5s) | every page mount |
| reveal | opacity 0 + `translateY(30px)` → in (.9s `cubic-bezier(.16,1,.3,1)`) | scroll-into-view (IntersectionObserver) |
| `marq`/`marqR` | duplicated-track marquees (26s/30s linear) | home capabilities band; footer "Let's build power —" |
| `floaty` | ±22px drift + 8° rotate (9–11s) | hero/auth radial blobs |
| `bob` | 8px bounce | hero scroll cue |

Custom cursor: 7px orange dot + 34px ring, lerped follow (0.35/0.16), ring scales 1.9× and
tints orange over interactive elements; **`(pointer:fine)` only**, native cursor hidden;
respect `prefers-reduced-motion`. Icons are unicode glyphs (`↗ → ← ↓ ✳ ◆ ✓ ✊`) — no icon library.

## Information architecture (14 screens → routes)

| Prototype view | Route | Notes |
|---|---|---|
| home | `/` | hero (rotating word: campaigns/movements/causes/coalitions) → capabilities marquee → positioning → stats → selected work 2×2 → dark services teaser → testimonials → CTA band |
| work | `/work` | filter pills (All/Campaigns/Fundraising/Organizing/Advocacy) over 8 project cards |
| case | `/work/[slug]` | brief (client/services/timeline/team) → orange results band → gallery → stack tags + pull quote → next link |
| services | `/services` | 6 numbered rows → dark 4-step process |
| serviceDetail | `/services/[slug]` | lede → hero placeholder → deliverables + body → dark 4-step "how it ships" → CTA |
| about | `/about` | story 2-col → 2×2 values → team grid (6) |
| contact | `/contact` | form (name/email/org/message) + sidebar (email, war room phone, locations); success state |
| pricing | `/pricing` | RAPID $8k / CAMPAIGN $25k (featured dark + POPULAR pill) / COALITION custom → FAQ (4) |
| blog | `/dispatch` | featured post + 6-post grid |
| post | `/dispatch/[slug]` | author block → placeholder hero → 720px article with blockquote → keep reading |
| docs | `/docs` | sticky sidebar (4 groups × 3 items) + playbook body with dark TIP callout |
| signin | `/sign-in` | chrome-less split screen (dark brand panel + form), stubbed submit |
| signup | `/sign-up` | as sign-in, registration variant |
| 404 | `not-found.tsx` | "This page went off the ballot." + giant 404 |

Global chrome (all routes except sign-in/sign-up): fixed blurred-cream header (dot+wordmark
logo, nav Work/Services/Pricing/Dispatch/About with orange active state incl. detail routes,
"Client login" link, dark "Start a project ↗" pill) and the dark footer (reverse marquee,
sitemap/social/newsletter columns, legal bar).

## How to use this handoff

Open the `.dc.html` beside the running app and implement screen-by-screen: tokens/chrome
first, then pages. Forms post to the existing public API (`/marketing/contact`,
`/marketing/newsletter`) via `@uprise/api-client` with Turnstile. Content lives in
`src/lib/data/*` typed modules transcribed from the prototype's script block.
