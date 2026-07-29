# Outreach + blast tiles — motion lab

Design reference for **two tiles inside the existing `#toolkit` band of the homepage** (`/`, which
renders `apps/product-marketing/src/components/homepage4/*`). Nothing else on the page changes: no
new section, so no new rail stop.

- The existing **"P2P texting & browser calls"** tile keeps its copy verbatim and gains a visual.
- **"Send to a whole audience"** is a new tile.

Why: the Toolkit has exactly one tile that genuinely *shows* a feature working – the turf minimap.
`Toolkit.tsx:27-35` argues the numbered feature grid excludes P2P *"because the tiles demonstrate
it"*, but no such demonstration exists, and blast messaging has no visual anywhere on the page.

## Files

- **`Uprise Outreach Tiles.prototype.html`** – a self-contained motion lab. No runtime, no
  dependencies.

```
python3 -m http.server 8899          # from the repo root
open "http://127.0.0.1:8899/docs/design_handoff_uprise_outreach_tiles/Uprise%20Outreach%20Tiles.prototype.html"
```

Everything in this prototype is drawn, so `file://` would also work – but use the server anyway, to
keep the command identical to `docs/design_handoff_uprise_marketing/` and because Google Fonts needs
the network regardless.

**This is not a `.dc.html`.** Three of the four other handoffs in `docs/` (`Uprise Labs.dc.html` +
`support.js`, `Yarns Canvassing.dc.html`, `Uprise Onboarding.dc.html`) are claude.ai design-tool
exports whose `<x-dc>` / `<sc-if>` / `{{ }}` / `style-hover=` constructs have to be translated away.
This one is hand-authored and has nothing to translate.

## What the lab is for

It is a motion lab, not a page mock. Five things make the motion judgeable:

| Control | Why it's there |
|---|---|
| **Replay all** / per-tile replay | Motion has to be watched more than once. Replay removes `.is-in`, forces a reflow, re-adds it – nothing else |
| **Speed** 1× / 0.5× / 0.25× | A 340ms cross-fade cannot be critiqued at 340ms. `--lab-t` multiplies every duration *and* delay |
| **Width** 1320 / 1000 / 640 | The two real breakpoints. Resizes the wrapper, not the browser, so all three compare in one glance. Motion judged at the wrong width is judged wrong |
| **Reduced motion** | The fallback, reviewable without changing an OS setting |
| **In situ** | Drops the two tiles into a stub bento with grey plates for the five existing tiles – so grid rhythm *and the section's total motion budget* get judged here rather than discovered live |

**In situ is the one to spend time on.** These two tiles join a turf outline that draws for 2s, ten
door pins staggering to 2.3s and a three-message thread finishing at 2.0s — all in one band, all
fired by the same observer as a reader scrolls. Six timelines is a busy section. That is the
judgement this lab exists to make early.

## The `.is-in` contract

The prototype animates by adding **`.is-in` to the payload container and nothing else** – byte
identical to what `RevealScope.tsx:41` and `:51` do in production. Children carry their own initial
state and a `var(--d)` delay. **Transitions only, no keyframes** (the one exception is `hp4pulse`,
which already exists in `homepage4.css`).

Class names are already `hp4-` prefixed. So the port is a move, not a reinterpretation.

Two consequences for Stage 3, both load-bearing:

1. `RevealScope.tsx`'s `TARGETS` string must gain `.hp4-outreach, .hp4-blast`. `.is-in` is added
   per observed element and the rules fire off the *payload's* class — a payload not listed never
   receives it and every child stays at `opacity: 0`, so the tile renders permanently blank.
2. `.hp4-states > *` needs `position: relative`. Not tidiness: a layer carrying a transform (the
   connecting spinner does) creates a stacking context and paints **above** its non-transformed
   siblings whatever the source order. Without it the spinner sits on top of the handset meant to
   replace it. Verified in-browser via `elementFromPoint`.

## Design tokens

| Token | Value | Source |
|---|---|---|
| `--hp4-brand` / `-50` / `-100` / `-300` / `-700` | `#465fff` `#ecf3ff` `#dde9ff` `#9cb9ff` `#2a31d8` | Already declared on `.hp4-root, .hp4-band` (`homepage4.css:26-89`) — brand ramp verbatim from `packages/ui/globals.css` |
| `--hp4-ink` / `-body` / `-muted` / `-faint` | `#0b0f1c` `#4a5468` `#7a869c` `#a7b0c0` | Already declared |
| `--hp4-line` / `-line-2` | `rgba(11,15,28,.09)` / `.055` | Already declared |
| `--hp4-sup-1` / `-sup-5` | `#2f9e5f` / `#dc5a4e` | Already declared — the five-point support scale, reused for RESPONDED / FAILED |
| `--hp4-seq-1` | `#c3cad3` | Already declared — reused for SKIPPED |
| `--hp4-ease` / `-ease-io` | `cubic-bezier(.22,1,.36,1)` / `(.65,0,.35,1)` | Already declared. **No third curve is introduced** |
| `#e8ebf3` | pending cell / rail track | **Departure** — but not new: it is already the `.hp4-bar` track colour in this file |
| `#fff6ed` `#fadfc2` `#8a5a1c` | the amber character-count pill | **Departure** — already in the file on `.hp4-pq`, and they are the product's own amber tones |
| `#1f9254` | compliance pass green | **Departure** — the `.hp4-synced` green already in the file |
| JetBrains Mono | every eyebrow, label and status | **Departure from `.design-sync/conventions.md`**, which mandates Outfit only. Deliberate and pre-existing on this page; marketing is light-only and single-brand |

## Motion timelines

Budgeted against what already runs in this band — turf outline `2s` then fill at `1.4s`, doors to
`2.3s`, thread messages at 400/900/1500ms, the shared `.hp4-rise` at `.85s`.

### Tile A — outreach (~2.45s)

| ms | Beat |
|---:|---|
| 100 | editor panel rises 8px |
| 220 | run 1 — `Hi {{first_name}}, it's Sam from the campaign — ` |
| 340 / 400 | the two draggable merge-tag chips lift in |
| 520 | run 2 — `we're knocking doors in {{location}} on Saturday 10am. Can you make it? ` |
| 820 | run 3 — `Reply STOP to opt out` |
| 900 | phone bezel rises |
| 1020 | the rendered SMS bubble appears |
| **1100** | **compliance flips red → green** |
| 1200 / 1260 | `Send Proof`, `Send Now` |
| 1300 | the call bar arrives (translateY 14px → 0, mirroring `fixed bottom-4`) |
| 1600 | status → `Ringing…` |
| 1900 | status → `0:02`; avatar swaps spinner → handset |
| 2050 | mute goes `opacity .4 → 1` |
| 2150 / 2230 | two settled call-log rows |
| — | char counter `0 → 141` over 1400ms, independent |

**The compliance flip is the tile.** It is literally true: the composer re-runs its opt-out check on
every keystroke, so an opt-out-free body genuinely warns and the third run genuinely clears it. It is
the only beat in this band that shows a product *behaviour* rather than a product *surface*.

### Tile B — blasts (~1.8s)

| ms | Beat |
|---:|---|
| 140 / 210 / 280 / 350 | rail chips: `DRAFTED → PROOFED → SENDING → SENT`; SENDING brand-coloured with a pulsing dot |
| 260 → 1360 | the rail track fills to the active stop (3 of 4 → `--w: 67%`) |
| 220 + (x·9 + y·22) | every cell **arrives** PENDING grey — `opacity` + `scale(.4)`, sweeping top-left → bottom-right |
| 800 + (x·11 + y·26) | a second, slower wave of **colour** crosses as each recipient's state resolves |
| 1300 | the state legend fades in |
| — | `475` counts up |

Two waves off one element, by giving `background-color` its own later delay variable (`--d2`) —
`.hp4-matrix s`, one property further on.

## Fidelity — literal vs stylised

The real risk with a drawn UI is asserting a feature that doesn't ship that way, and no screenshot
diff will catch it. **No capture exists for texting, calls or blasts** (checked all 18 `screens.json`
entries), so all of this is drawn.

**Literal — copied from the product, keep them exact:**

| Element | Source |
|---|---|
| `Message content`, `141 / 160 chars` | `blasts/[id]/composer/page.tsx:825`, `:832`, `maxCharacters = 160` at `:318` |
| `{{first_name}}` `{{location}}` | `:46` — the two always-available tags |
| `Missing opt-out language. Include 'Reply STOP to opt out'.` | `:401` |
| `No compliance warnings detected.` | `:1090` |
| `Send Proof` / `Send Now` | `:721` / `:729` |
| `SMS` / `WhatsApp` channel toggle | `:747-769` |
| `Connecting…` → `Ringing…` → timer | `softphone/call-bar.tsx:24`, `:26` |
| `· from +61 …` | `call-bar.tsx:47` — appended to **every** state, so it sits outside the swap |
| mute dimmed until the leg is open | `call-bar.tsx:55` — genuinely `disabled unless state === "open"` |
| `COMPLETED` / `NO_ANSWER` | `CallStatus` enum, `packages/db/prisma/schema.prisma:2291-2300` |
| `DRAFTED PROOFED SENDING SENT` | `BlastStatus`, `schema.prisma:59-67` |
| `QUEUED SENT DELIVERED RESPONDED SKIPPED FAILED` | `BlastRecipientStatus`, `schema.prisma:69-80` |
| `475 per send batch · 500 cap` | `BLAST_SEND_BATCH_SIZE`, `apps/api/src/blasts/blasts.service.ts:500-503` |
| the phone shell | `aspect-ratio: 486/1024`, notch pill + camera dot — the admin composer's own Live Preview mock, and the same numbers `.hp4-phone` uses |

**Stylised — representative, not a claim:**

- The **recipient board is a shape, not a count.** 18 × 8 = 144 cells; the batch is 475. Coarse on
  purpose, in the same spirit as `AU_GRID`'s "coarse on purpose" comment. Do not try to make the cell
  count equal 475.
- Cell states come from a deterministic hash (`DataArc`'s, verbatim) so SSR and client agree. The
  handful of red `FAILED` cells is deliberate — a delivery board with zero failures would be the lie.
- The **pulsing dot on the live timer** is invented chrome; the real call bar has none. First thing
  to cut if anyone objects.
- Names and numbers (`Priya Raman`, `+61 4·· ··· 118`) are placeholders in the masked style the
  product already uses.

**Two figures only, and both are configuration rather than usage:** `475` and `500`. Nothing on
either tile counts anything that would need a real source — the rule `sections.ts:1-13` and
`content.ts:8-16` already impose.

**`141` is not a mistake.** It is `template.length` with the tags **unrendered**, which is what the
composer counts. The rendered preview beside it is 126 characters — shorter on purpose, and that gap
is the counter's whole point. It needs a code comment at Stage 3 so nobody "fixes" it.

## Copy

Unchanged. Tile A is `SMALL_TILES[0]` (`sections.ts:57-61`) verbatim:

> **P2P texting & browser calls** — "A peer-to-peer SMS console with a live dual-channel preview,
> plus a WebRTC softphone that dials from the campaign's own number."

Tile B's copy is new and describes only what the composer and the dispatcher actually do.

### One inherited inaccuracy, knowingly kept

There is **no organiser-facing P2P SMS console**. On the organiser side P2P is a checkbox on the
blast composer (*"P2P text bank — volunteers press-send each message"*, `composer/page.tsx:984-993`);
the real console is a **volunteer** app in `packages/field` — "Text banks", "Get 10 texts", *"Your
tap is the send — each message goes out one at a time, from you."*

This was raised during planning and the decision was to leave the copy and design around it. So the
visual is grounded in the **blast composer's real surface**, which genuinely is an organiser SMS
surface with a live dual-channel preview — i.e. exactly what the sentence's first clause describes.
Every string is copied from the product. Nothing new asserts a console exists.

If it ever matters, the fix is a third tile using `.hp4-thread` plus a `data-to` on `N sent · M to
go` — the primitives are already there.

### One deliberate reduction

The SMS → WhatsApp → SMS preview swap was cut for a **static `SMS | WhatsApp` pill pair** with SMS
active — the composer's real toggle. It still carries "dual-channel preview", takes ~1.4s off the
timeline, and removes a real inaccuracy: the WhatsApp path renders an approved template
(`contentSid`), not the SMS body, so swapping the same text between channels would have compared
templates while pretending to compare channels.

## Fallbacks — both load-bearing

**Responsive.** Mirrors the two production breakpoints exactly: `≤1000px` `t7`/`t5` → `span 12` and
`ttall` → `grid-row: auto`; `≤640px` `t6` → `span 12`, the composer stacks to one column, and the
board **keeps its 18 columns** — the cell delays are computed from `(x, y)` against an 18-wide grid,
so re-columning would garble the frontier. Rows come off instead.

**Reduced motion.** The production block at `homepage4.css:2091` is scoped to `.hp4-root *`, which
wraps only the opening — verified: **zero** `hp4-band` mentions. So the turf minimap still runs its
full 2s draw and the inbox thread still staggers under `prefers-reduced-motion: reduce`, and they
fire at *load*, because `RevealScope` stamps `is-in` immediately in that mode. It isn't a missing
trigger; it's a live animation with no brake.

The fix, previewable here on the **Reduced motion** button, is to extend that selector list with
`.hp4-band *`, `*::before`, `*::after` **and add `transition-delay: 0ms !important`**. The delay line
is not optional: zeroing duration alone leaves a 1.3s-delayed layer waiting 1.3s before snapping in,
so a visitor would sit looking at a red compliance warning and a "Connecting…" call. With both in
place every `.is-in` rule lands at t=0 and each `.hp4-states` group resolves to its **last** layer —
rendered message, green compliance, `0:02` with the handset, fully-coloured board, filled rail.

Blast radius to flag in review: it also flattens `.hp4-tile:hover`, which under reduced motion is
correct behaviour but is wider than the current block reaches.

## Grid

The tiles land in a restructured bento. Every row totals 12; nothing existing moves.

```
≥1000px · 12 cols, 14px gap
┌────────────────────────┬─────────────────┐
│ canvass      t7 · tall │ inbox        t5 │ r1   unchanged
│                        ├─────────────────┤
│                        │ five-point   t5 │ r2   unchanged
├────────────────────────┼─────────────────┤
│ OUTREACH          t7   │ BLASTS       t5 │ r3
├────────────┬───────────┴─────────────────┤
│ shifts  t6 │ white-label             t6  │ r4
└────────────┴─────────────────────────────┘
```

`.hp4-t4` becomes unused (verified nothing else in the repo uses it) and `.hp4-t6` replaces it. This
also fixes a live bug: at ≤1000px the three current `t4` tiles make 12 + **6 orphan columns**.

The outreach tile is a **single-row `t7`**, not row-spanning. That is deliberate — a `ttall` tile is
forced to the height of the two `t5`s beside it, leaving ~240px of slack to place somewhere; a
single-row tile sizes to its own content and the problem doesn't exist.

## Reviewing this

1. **Replay all** at **0.25×**, then 1×. Watch each tile's timeline separately with the per-tile
   replay button.
2. **In situ**, at 1320 — does the section survive six timelines, or does it read as busy?
3. **1000** and **640** — the composer stacks; check the board still reads at 18 columns.
4. **Reduced motion** — every tile should be **complete and static**: rendered message, green
   compliance, `0:02` with the handset glyph, fully-coloured board, filled rail. Not blank, not
   still-staggering.

### Not yet verified

The lab was checked in-browser for the paint-order fix (via `elementFromPoint`) and for panel/phone
proportions, but **it has not been reviewed at 1320 / 1000 / 640** — the browser window in the
authoring session would not resize, so those three widths are exactly what Checkpoint 1 is for.
