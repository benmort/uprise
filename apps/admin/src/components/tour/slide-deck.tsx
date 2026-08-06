"use client";

import { ArrowRight, Check, ChevronLeft, ChevronRight, Info, Pause, Play } from "lucide-react";
import { Fragment } from "react";

import { cn } from "@/lib/utils";
import type {
  ChecklistSlide,
  ChipsSlide,
  ClosingSlide,
  ColumnsSlide,
  CompareSlide,
  DiagramSlide,
  FlowSlide,
  HeroSlide,
  NumberedSlide,
  SlideTone,
  TourSlide,
} from "@/lib/tours/slides";

/**
 * The full-screen presentation layer.
 *
 * Rendered by FloatingTourCard in place of the spotlight + card whenever a step carries a slide,
 * through the same portal and at the same z-index — the two are mutually exclusive, so the app
 * shell (z-50) is covered without touching the Fullscreen API.
 *
 * Deliberately keyboard-free: the card owns a capture-phase handler for ←/→/Enter/Esc, so binding
 * anything here would double-fire. The deck only renders the affordances.
 */

/** Per-tone class fragments. Every value is a design token — no raw hex, per design-system.md. */
const TONES: Record<
  SlideTone,
  {
    bg: string;
    fg: string;
    muted: string;
    accent: string;
    eyebrow: string;
    hairline: string;
    navBtn: string;
    dotActive: string;
    dotIdle: string;
  }
> = {
  blue: {
    bg: "bg-primary",
    fg: "text-primary-foreground",
    // On #465FFF, the on-primary token measures 4.64:1 — AA for normal text. Opacity muting drops
    // below that (/90 ≈ 4.07:1), so blue slides carry hierarchy in size and weight instead, and
    // reserve transparency for hairlines.
    muted: "text-primary-foreground",
    accent: "bg-primary-foreground",
    eyebrow: "text-primary-foreground",
    hairline: "border-primary-foreground/25",
    navBtn: "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10",
    dotActive: "bg-primary-foreground",
    dotIdle: "bg-primary-foreground/30",
  },
  light: {
    bg: "bg-background",
    fg: "text-foreground",
    muted: "text-muted-foreground",
    accent: "bg-primary",
    eyebrow: "text-primary",
    hairline: "border-border",
    navBtn: "border-border text-muted-foreground hover:bg-surface-variant hover:text-foreground",
    dotActive: "bg-primary",
    dotIdle: "bg-border",
  },
  grey: {
    bg: "bg-surface-variant",
    fg: "text-foreground",
    muted: "text-muted-foreground",
    accent: "bg-primary",
    eyebrow: "text-primary",
    hairline: "border-border",
    navBtn: "border-border text-muted-foreground hover:bg-surface hover:text-foreground",
    dotActive: "bg-primary",
    dotIdle: "bg-border",
  },
};

/** Accent rule + micro-label + display headline. The house editorial block, at slide scale. */
function Eyebrow({ slide, hero = false }: { slide: TourSlide; hero?: boolean }) {
  const t = TONES[slide.tone];
  return (
    <header>
      <span aria-hidden className={cn("block h-0.5 w-10 rounded-full", t.accent)} />
      <p className={cn("mt-5 text-xs font-semibold uppercase tracking-[0.18em]", t.eyebrow)}>
        {slide.eyebrow}
      </p>
      <h1
        className={cn(
          "mt-3 font-headline font-extrabold",
          hero
            ? "max-w-5xl text-title-md tracking-[-0.025em] md:text-title-lg lg:text-title-xl"
            : "max-w-4xl text-title-sm tracking-[-0.02em] md:text-title-md lg:text-title-lg",
          t.fg,
        )}
      >
        {slide.title}
      </h1>
    </header>
  );
}

function HeroLayout({ slide }: { slide: HeroSlide }) {
  return (
    <div className="flex flex-1 flex-col justify-center pb-10">
      <Eyebrow slide={slide} hero />
      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-primary-foreground lg:text-xl">
        {slide.lede}
      </p>
    </div>
  );
}

function ChipsLayout({ slide }: { slide: ChipsSlide }) {
  const t = TONES[slide.tone];
  return (
    <>
      <Eyebrow slide={slide} />
      <div className="mt-10 flex max-w-4xl flex-wrap gap-2.5">
        {slide.chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-card"
          >
            {chip}
          </span>
        ))}
      </div>
      <p className="mt-10 max-w-3xl text-lg font-semibold leading-snug text-foreground lg:text-xl">
        {slide.note}
      </p>
      <div className="mt-7 grid max-w-3xl gap-6 sm:grid-cols-3">
        {slide.consequences.map((c) => (
          <p key={c} className={cn("border-t pt-3.5 text-sm font-medium", t.hairline, t.muted)}>
            {c}
          </p>
        ))}
      </div>
    </>
  );
}

/**
 * Hub and spokes drawn with bordered divs rather than SVG, so the connectors inherit the theme
 * (and dark mode) for free. The rail spans the outer columns' centres — at three equal columns
 * that is one sixth in from each edge.
 */
function DiagramLayout({ slide }: { slide: DiagramSlide }) {
  return (
    <>
      <Eyebrow slide={slide} />
      <div className="mt-8 flex flex-1 flex-col justify-center pb-6">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mx-auto w-fit rounded-2xl border border-border bg-surface px-7 py-4 text-center shadow-card">
            <p className="text-base font-bold text-foreground">{slide.hub.label}</p>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">{slide.hub.sublabel}</p>
          </div>

          <div aria-hidden className="mx-auto h-8 w-px bg-border" />
          <div aria-hidden className="relative h-px">
            <div className="absolute inset-y-0 left-[16.666%] right-[16.666%] bg-border" />
          </div>
          <div aria-hidden className="grid grid-cols-3">
            {slide.nodes.map((n, i) => (
              <div key={`${n.label}-${i}`} className="mx-auto h-8 w-px bg-border" />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-5">
            {slide.nodes.map((node, i) => (
              <div
                key={`${node.label}-${i}`}
                className="rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <p className="text-sm font-bold text-foreground">{node.label}</p>
                <ul className="mt-3 space-y-2">
                  {node.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-xs leading-snug text-muted-foreground"
                    >
                      <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function FlowLayout({ slide }: { slide: FlowSlide }) {
  return (
    <>
      <Eyebrow slide={slide} />
      <div className="mt-10 flex max-w-5xl flex-wrap items-center gap-x-2.5 gap-y-3">
        {slide.stages.map((stage, i) => (
          <Fragment key={stage}>
            {i > 0 ? (
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            ) : null}
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 shadow-card">
              <span className="text-xs font-bold tabular-nums text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-semibold text-foreground">{stage}</span>
            </span>
          </Fragment>
        ))}
      </div>
      <div className="mt-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {slide.tagsLabel}
        </p>
        <div className="mt-3.5 flex max-w-4xl flex-wrap gap-2">
          {slide.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-variant px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function ChecklistLayout({ slide }: { slide: ChecklistSlide }) {
  return (
    <>
      <Eyebrow slide={slide} />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{slide.lede}</p>
      <div className="mt-9 grid max-w-5xl gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {slide.items.map((item) => (
          <div key={item} className="flex items-center gap-2.5">
            {/* Blue rather than success green: these are provisioned, not achieved — and nine
                green ticks would spend the deck's semantic-colour budget on decoration. */}
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10"
            >
              <Check className="h-3.5 w-3.5 text-primary" />
            </span>
            <span className="text-sm font-medium text-foreground">{item}</span>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <span className="inline-flex items-center gap-2.5 rounded-full border border-warning-foreground/30 bg-warning-container px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-warning-foreground">
          <Info aria-hidden className="h-4 w-4" />
          {slide.marker}
        </span>
      </div>
    </>
  );
}

function NumberedLayout({ slide }: { slide: NumberedSlide }) {
  return (
    <>
      <Eyebrow slide={slide} />
      <ol className="mt-10 grid max-w-5xl gap-x-12 gap-y-8 md:grid-cols-2">
        {slide.questions.map((q, i) => (
          <li key={q} className="border-t border-border pt-5">
            <span
              aria-hidden
              className="font-headline text-title-sm font-extrabold tabular-nums text-primary"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="mt-2 max-w-md text-lg font-bold leading-snug tracking-[-0.01em] text-foreground lg:text-xl">
              {q}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-10 max-w-3xl text-base leading-relaxed text-muted-foreground">{slide.outro}</p>
    </>
  );
}

function ColumnsLayout({ slide }: { slide: ColumnsSlide }) {
  return (
    <>
      <Eyebrow slide={slide} />
      <div className="mt-9 grid max-w-5xl gap-5 md:grid-cols-3">
        {slide.columns.map((col) => (
          <div
            key={col.heading}
            className="rounded-3xl border border-border bg-surface p-6 shadow-card"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {col.heading}
            </p>
            <ul className="mt-4 space-y-3">
              {col.items.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm leading-snug text-foreground"
                >
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function ClosingLayout({ slide }: { slide: ClosingSlide }) {
  const t = TONES[slide.tone];
  return (
    <div className="grid flex-1 content-center gap-10 pb-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <Eyebrow slide={slide} />
        <p className="mt-6 max-w-md text-base leading-relaxed text-primary-foreground lg:text-lg">
          {slide.lede}
        </p>
      </div>
      <ol className="self-center">
        {slide.path.map((step, i) => (
          <li
            key={step}
            className={cn("flex items-baseline gap-5 border-t py-4 last:border-b", t.hairline)}
          >
            <span
              aria-hidden
              className="w-8 shrink-0 font-headline text-xl font-extrabold tabular-nums text-primary-foreground"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-base font-semibold leading-snug text-primary-foreground lg:text-lg">
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CompareLayout({ slide }: { slide: CompareSlide }) {
  return (
    <>
      <Eyebrow slide={slide} />
      <div className="mt-8 max-w-6xl">
        {/* Column labels once, not per row — the rows below stay label-free and scannable. */}
        <div className="grid grid-cols-[7.5rem_1fr_1.25fr] gap-3 max-md:hidden">
          <span />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {slide.leftLabel}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {slide.rightLabel}
          </span>
        </div>
        <div className="mt-2 space-y-2.5">
          {slide.rows.map((row) => (
            <div key={row.capability} className="grid gap-2.5 md:grid-cols-[7.5rem_1fr_1.25fr] md:gap-3">
              <p className="pt-3 text-xs font-semibold uppercase leading-snug tracking-[0.14em] text-muted-foreground">
                {row.capability}
              </p>
              <div className="rounded-2xl border border-border bg-surface p-3.5 text-sm leading-snug text-foreground">
                {row.left}
              </div>
              <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-3.5 text-sm leading-snug text-foreground">
                {row.right}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-4xl text-sm leading-relaxed text-muted-foreground">{slide.note}</p>
      </div>
    </>
  );
}

function renderLayout(slide: TourSlide) {
  switch (slide.kind) {
    case "hero":
      return <HeroLayout slide={slide} />;
    case "chips":
      return <ChipsLayout slide={slide} />;
    case "diagram":
      return <DiagramLayout slide={slide} />;
    case "flow":
      return <FlowLayout slide={slide} />;
    case "checklist":
      return <ChecklistLayout slide={slide} />;
    case "numbered":
      return <NumberedLayout slide={slide} />;
    case "columns":
      return <ColumnsLayout slide={slide} />;
    case "compare":
      return <CompareLayout slide={slide} />;
    case "closing":
      return <ClosingLayout slide={slide} />;
  }
}

export interface SlideDeckProps {
  slide: TourSlide;
  /** 0-based position among the tour's slides. */
  index: number;
  total: number;
  mode: "manual" | "auto";
  paused: boolean;
  visible: boolean;
  isLastSlide: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onPauseToggle: () => void;
}

export function SlideDeck({
  slide,
  index,
  total,
  mode,
  paused,
  visible,
  isLastSlide,
  onNext,
  onPrev,
  onClose,
  onPauseToggle,
}: SlideDeckProps) {
  const t = TONES[slide.tone];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Slide ${index + 1} of ${total}: ${slide.title}`}
      style={{ opacity: visible ? 1 : 0 }}
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col overflow-y-auto",
        "transition-[opacity,background-color] duration-300 motion-reduce:transition-none",
        t.bg,
        t.fg,
      )}
    >
      {/* Remounted per slide so the entrance animation replays, while the shell — and therefore
          the background colour — persists and crossfades between tones. */}
      <main
        key={slide.id}
        className="animate-fade-up mx-auto flex w-full max-w-6xl flex-1 flex-col px-8 pt-12 md:px-14 lg:px-20 lg:pt-16"
      >
        {renderLayout(slide)}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-8 pb-7 md:px-14 lg:px-20">
        <div className={cn("flex items-center justify-between border-t pt-4", t.hairline)}>
          <span className={cn("text-xs font-bold tabular-nums tracking-[0.16em]", t.fg)}>
            {String(index + 1).padStart(2, "0")}
            <span className="font-medium opacity-60"> / {String(total).padStart(2, "0")}</span>
          </span>

          <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? cn("w-4", t.dotActive) : cn("w-1.5", t.dotIdle),
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-4">
            <span className={cn("hidden text-xs font-semibold tracking-[0.08em] md:inline", t.fg)}>
              uprise.org.au
            </span>
            {mode === "auto" ? (
              <button
                type="button"
                onClick={onPauseToggle}
                aria-label={paused ? "Resume auto-play" : "Pause auto-play"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                  t.navBtn,
                )}
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrev}
                aria-label="Previous slide"
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                  t.navBtn,
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={isLastSlide ? onClose : onNext}
                aria-label={isLastSlide ? "Finish" : "Next slide"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                  t.navBtn,
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <kbd
              className={cn(
                "hidden rounded border px-1.5 py-0.5 text-[11px] font-medium lg:inline",
                t.hairline,
                t.fg,
              )}
            >
              Esc
            </kbd>
          </div>
        </div>
      </footer>
    </div>
  );
}
