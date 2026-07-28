# Uprise product marketing — home page design handoff

Design reference for the **home page of `apps/product-marketing`** (uprise.org.au; served
locally on 3003, tunnelled to `dev.uprise.org.au`). Direction: **"cinema"** – the stacked
card grids are replaced by one continuous scroll film that follows a single campaign shift
from cutting turf to reshaping it. Brand indigo and Outfit are kept; the immersion comes
from choreography and depth, not a new palette.

Scope is the **home page only**. Every other route keeps its current design until the
language here is signed off.

## Files

- **`Uprise Marketing Home.prototype.html`** — a self-contained, interactive prototype.
  Open it over a local HTTP server rooted at the repo (it loads the real product captures
  by relative path):

  ```
  python3 -m http.server 8899          # from the repo root
  open "http://127.0.0.1:8899/docs/design_handoff_uprise_marketing/Uprise%20Marketing%20Home.prototype.html"
  ```

  Opening it straight off `file://` works too, but Chrome may refuse the relative image
  paths, in which case the frame falls back to a striped "capture pending" plate.

**This is not a `.dc.html`.** The three older handoffs in `docs/design_handoff_uprise_*`
are exports from the claude.ai design tool and need their generated `support.js` runtime.
This one is hand-authored plain HTML/CSS/JS with no runtime and no dependencies, so there
is nothing to translate away – but it is still a **design reference, not production code**.
The build is a Next.js App Router implementation using the app's own Tailwind v4 tokens and
small local components.

## What changed, and why

The current home page is a competent but templated light SaaS layout: indigo on white,
rounded 1px-border cards in 3-up grids repeated six times, everything centre-aligned, no
depth, and no motion beyond a screenshot carousel. Nothing on it could only be Uprise.

The strongest asset was already on the page and under-used – real screens from a live
workspace. The redesign makes them the subject rather than an illustration:

| Current | Prototype |
|---|---|
| Pastel gradient hero, centred, static | Four parallax planes (aurora / hairline grid / cursor spotlight / content), word-level mask reveal, coverage counters that tick up |
| Screenshot carousel with prev/next | A **pinned stage**: one device, five scenes, scroll-driven. The frame resizes between beats and recedes entirely on scene 02 so a drawn phone can take over |
| 12 identical feature cards in a 3×4 grid | A bento of unequal weights, two tiles holding live micro-demos (a turf polygon that draws itself, an inbox where messages land) |
| "Australian data" as body copy | A full-bleed **dark act** – Australia as a 32×22 dot matrix shaded off the `--seq-*` ramp, with real coverage figures |
| 6 campaign-type cards in a grid | A horizontal snap rail you can drag |
| Plain CTA band | A full-height closing frame that brings the aurora back |

## Design tokens

Everything below is either taken verbatim from `packages/ui/globals.css` or is a
deliberate, noted departure.

**Colour**

| Token | Value | Source | Use |
|---|---|---|---|
| brand | `#465fff` | `--color-brand-500` | primary CTA, eyebrows, accents, active states |
| brand-600 | `#3641f5` | verbatim | primary hover |
| brand-400 / 300 / 100 / 50 | `#7592ff` `#9cb9ff` `#dde9ff` `#ecf3ff` | verbatim | tints, chip icons, atlas eyebrow |
| ink | `#0B0F1C` | **departure** | headings, dark footer |
| ink-2 | `#070A14` | **departure** | the atlas act, footer |
| body | `#4A5468` | ≈ `--text-color` | body copy |
| muted / faint | `#7A869C` / `#A7B0C0` | ≈ `--text-color-secondary/tertiary` | labels, meta |
| plate | `#F6F7FB` | ≈ `--surface-variant` | section grounds |
| line | `rgba(11,15,28,.09)` | ≈ `--stroke-secondary` | 1px borders, hairline grid |
| glass | `rgba(255,255,255,.72)` + `blur(18px) saturate(1.6)` | new | condensed header, satellites |
| seq-1…5 | `#c3cad3 #87a6c9 #3776b8 #1c5cb0 #0f3f85` | `--seq-1..5` | atlas choropleth ramp |

> **The one departure that matters:** ink is deepened from the current `--title-color`
> `#1e293b` to `#0B0F1C`. At display sizes `#1e293b` reads washed against white, and the
> deeper ink lets the dark act read as the same family rather than a different site. If it
> ships, change `--title-color` in the marketing app only – not in `@uprise/ui`.

**Type** — **Outfit** 300–800 (already loaded via `next/font/google`) for everything except
labels; **JetBrains Mono** 400/500 for every eyebrow, label, meta line and stat caption
(11.5px, `letter-spacing:.16em`, uppercase). Mono is a **new dependency** for this app.

| Role | Spec |
|---|---|
| display | `clamp(48px,7.6vw,118px)` w700, lh .96, tracking −.045em |
| section h2 | `clamp(34px,5vw,68px)` w700, lh 1.02, tracking −.035em |
| scene h2 | `clamp(30px,3.5vw,50px)` w700, lh 1.04 |
| lede | `clamp(18px,1.55vw,23px)` w400, lh 1.55 |
| body | 17px / 1.65 |
| card h3 | `clamp(21px,2vw,27px)` w600, tracking −.02em |

Mask-reveal headings need `padding-bottom:.18em` + `margin-bottom:-.18em` on the clip box.
Plain `overflow:hidden` shears the descender of "Progress" at display size.

The hero's second line is **flat `--brand`, not a gradient**. A per-word gradient restarts
inside every mask and reads as three mismatched washes; a soft `text-shadow` bloom does the
lifting instead.

**Layout** — container `max-width:1320px`, gutter `clamp(20px,4vw,48px)`. Section rhythm
`clamp(90px,11vw,150px)`. Radii: pills/buttons `100px`, tiles `18–20px`, frame `15px`,
minimap `12px`.

## Motion

| Mechanism | Behaviour | Where |
|---|---|---|
| parallax planes | `translate3d(0, -sectionTop × rate, 0)` at rates `.06` (aurora) and `.16` (grid) | hero, finale |
| aurora | three blurred radial blobs drifting on 34s / 44s / 52s loops | hero, finale |
| cursor spotlight | 420px radial follows the pointer, `(pointer:fine)` only | hero |
| mask reveal | per-word `translateY(110%)` → 0, 1.05s, staggered 60ms | display headings |
| rise | `opacity 0 + translateY(26px)` → in, .85s, IntersectionObserver | everything else |
| **pinned stage** | 480vh tall, `position:sticky` pin; scroll → `raw = p × (N−1) + .5` | act 1 |
| device tilt | frame leans ±5°/±3.4° toward the cursor, lerped at .06 | act 1 |
| count-up | 1.4s cubic ease-out, `toLocaleString("en-AU")` | ticker, atlas, satellites |
| turf draw | `stroke-dashoffset` 900 → 0 over 2s, then fill, then doors at 80ms stagger | act 2 |
| matrix fill | cells scale .4 → 1, staggered by distance from the south-east | act 3 |
| snap rail | `scroll-snap-type:x mandatory` + pointer drag | act 4 |

**Two mechanics worth copying exactly, because both took a fix to get right:**

1. **Scene banding.** `band(raw, i, w, gap)` returns 1 across the middle of scene `i`'s
   band and crosses to 0 over `w` either side of the boundary. Copy takes `gap: .08` so the
   outgoing headline is fully gone before the next arrives – without the gap two headlines
   sit legibly on top of each other. Captures take `gap: 0` and a narrow `w: .09`, because a
   cross-dissolve between two dense UI screenshots reads as a rendering glitch if it lingers.
2. **The `+.5` in the scroll mapping.** Mapping progress straight onto `0..N` leaves the
   first and last scenes half-faded at the pin edges, which shows as a void before and after
   the stage. `p × (N−1) + .5` centres scene 0 the instant the stage pins and holds scene 4
   until it releases.

**Reduced motion and narrow viewports** share one fallback (`@media (max-width:1000px),
(prefers-reduced-motion:reduce)`): the stage un-pins, the five scenes become ordinary
stacked sections, and the captures lay out in normal flow. This block is **load-bearing, not
cosmetic** – `paintStage()` is what sets capture opacity, so without it every screenshot
stays at its `opacity:0` default and the whole scene set renders blank.

## The five scenes

| # | Copy beat | Frame | Satellites |
|---|---|---|---|
| 01 | Cut the turf before anyone leaves the office | `turf@2x` @1000px | doors in this turf · doors knocked + bar |
| 02 | Hand every volunteer a route, not a spreadsheet | **none** – frame recedes to 7% and scales down; drawn phone scales to 1.3× | – (the phone carries it) |
| 03 | Every reply lands in one claimable queue | `inbox-dark@2x` @900px | unified inbox count |
| 04 | Turn the conversation into a number you can target on | `results@2x` @920px | 5-point meter · doors attempted |
| 05 | Then reshape the turf around what you learned | `datasets@2x` @1000px | local government areas |

Scene 03 shows the app's **dark theme** inside a light page. That is deliberate and labelled
("Shown in dark theme") so it does not read as a mistake – it is also the only usable inbox
capture (see below).

## Capture set — needs a re-shoot before this ships

Checked every file in `apps/product-marketing/public/images/marketing/screens` on
2026-07-28. Three are broken and one is the wrong screen:

| File | State |
|---|---|
| `dashboard@2x.png` | ❌ ngrok `ERR_NGROK_8012` error page |
| `demographics@2x.png` | ❌ same file, byte-identical (`70a6ed8c…`) |
| `inbox@2x.png` | ❌ same file, byte-identical |
| `field-walk@2x.png` | ⚠️ the field app **sign-in** screen (mobile number + "Knock & log in one tap"), not a walk list – captured unauthenticated |
| `turf@2x`, `results@2x`, `datasets@2x`, `branding@2x` | ✅ genuine light captures |
| `inbox-dark@2x`, `demographics-dark@2x`, `turf-dark@2x`, `results-dark@2x`, `datasets-dark@2x`, `dashboard-dark@2x`, `branding-dark@2x`, `field-walk-dark@2x` | ✅ unique files; `inbox-dark` and `datasets` verified by eye |

The prototype is wired **only to verified-good captures**, which is why scene 02 has no
screenshot at all. Re-run `pnpm marketing:shots` against a seeded, authenticated local
environment with all four apps up, then: point scene 02 at a real walk-list capture, and
decide whether scene 03 keeps the dark inbox or moves to a fixed light one.

## Numbers on this page

Every figure in the prototype is a **coverage** number read off the product's own Datasets
screen – 16,905,838 addresses, 150 federal divisions, 415 + 23 state seats, 547 LGAs – and
each stage satellite quotes the capture sitting behind it (150 doors, 67% knocked, 24 in the
unified inbox, 90 doors attempted).

There are deliberately **no usage or growth stats** ("184k doors knocked", "2.4M messages
sent" and similar). An earlier draft had them and they were invented. If marketing wants
social proof of that kind, it needs a real source before it goes on the page. The same
applies to the four logos in the proof row – `Australian Progress` and `Common Threads` are
on the current site; `Tomorrow Movement` and `Sweltering Cities` are **placeholders** and
must be confirmed or removed.

Blog cards reuse the three real posts from the live site. Their thumbnails are gradient
placeholders.

## Build notes

- The stage is the only genuinely new engineering. Everything else is layout plus the shared
  rise/IntersectionObserver helper.
- Drive the stage from a single `requestAnimationFrame`-throttled scroll handler, as the
  prototype does – one handler paints the progress hairline, the header state, the parallax
  planes, the hero dissolve, the stage and the act rail.
- Satellite count-ups are triggered from the stage's live-scene change, **not** from an
  IntersectionObserver. The satellites are absolutely positioned inside the pinned deck, so
  they are technically in view for the stage's whole 480vh and an observer fires them all at
  once, long before their scene arrives.
- Icons are unicode glyphs (`→ ↓ ↗ ◆ ◈ ✓ ↻`). Swap for the app's existing icon set on build.
- The act rail uses `mix-blend-mode:difference` so one element works over both the light and
  dark acts. Hidden below 1180px.
- Copy is the current site's, lightly reworked. It is already Australian English; keep it
  that way, and keep spaced en-dashes rather than em-dashes.
