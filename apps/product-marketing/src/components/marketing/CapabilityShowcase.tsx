"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { Reveal } from "@uprise/ui";
import SCREENS from "../../../public/images/marketing/screens/screens.json";
import { CAPABILITIES, type Capability } from "./capabilities";
import Callout from "./Callout";

/** ms per step when auto-advancing. Long enough to actually read the callouts. */
const DWELL_MS = 7000;
/** Gap between a screenshot settling and its callouts drawing on, then between callouts. */
const CALLOUT_LEAD_MS = 550;
const CALLOUT_STAGGER_MS = 700;

type ScreenMeta = { file: string; width: number | null; height: number | null; alt: string };
// The manifest also carries a leading `_comment`, so it can't be asserted straight to a
// Record<string, ScreenMeta> — go via unknown and let the lookup guard on width/height.
const screens = SCREENS as unknown as Record<string, ScreenMeta | undefined>;

/** A capability is showable only when its capture exists with real dimensions. */
function isCaptured(c: Capability): boolean {
  const m = screens[c.screen];
  return Boolean(m?.file && m?.alt && m.width && m.height);
}

/**
 * The homepage capability walkthrough: a sticky screenshot stage that advances through the product's
 * real surfaces, drawing annotation callouts onto each one in sequence.
 *
 * Auto-advances, but yields to the visitor — it pauses on hover, on keyboard focus within, when
 * scrolled out of view, and permanently once they touch a control. Reduced-motion users get no
 * auto-advance, no slide and all callouts at once. Below `lg` the sticky stage is dropped entirely
 * for a plain stacked list, because a pinned stage on a short phone viewport is a trap.
 */
export default function CapabilityShowcase() {
  // Only capabilities with a real capture. The whole section is about showing the actual product,
  // so a capability with no screenshot has nothing to say here — and a visitor must never be shown
  // a "pending capture" box. Renders nothing at all until `pnpm marketing:shots` has been run.
  const shown = useMemo(() => CAPABILITIES.filter((c) => isCaptured(c)), []);
  const [active, setActive] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  // Bumped on every step change; keys the callout sequence so it replays per screenshot.
  const [runId, setRunId] = useState(0);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Only run the timer while the section is actually on screen — an unseen carousel burning
  // through its steps means the visitor arrives mid-sequence with no idea what they missed.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = inView && !userPaused && !hovered && !focused && !reduced;

  const goTo = useCallback((i: number) => {
    setActive(((i % shown.length) + shown.length) % shown.length);
    setRunId((r) => r + 1);
  }, [shown.length]);

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => goTo(active + 1), DWELL_MS);
    return () => clearTimeout(t);
  }, [running, active, goTo]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setUserPaused(true);
      goTo(active + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setUserPaused(true);
      goTo(active - 1);
    }
  };

  const current = shown[active];

  // Nothing captured yet — render nothing rather than a wall of placeholders.
  if (!current) return null;

  return (
    <section className="bg-[linear-gradient(180deg,#FFF_0%,#F9FAFB_100%)] py-16 md:py-24 lg:py-30">
      <div className="container">
        <Reveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-wide text-primary">
              See it working
            </span>
            <h2 className="text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
              The whole campaign, on one screen at a time
            </h2>
            <p className="mt-4 text-base !leading-normal text-text-color-secondary">
              Real screens from the product — not mockups. Every capture comes from a live Uprise
              workspace running on demo data.
            </p>
          </div>
        </Reveal>

        {/* ── Desktop: sticky stage + step rail ───────────────────────────────── */}
        <div
          ref={sectionRef}
          className="hidden lg:block"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={() => setFocused(false)}
          onKeyDown={onKeyDown}
        >
          <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-14">
            <Stage capability={current} runId={runId} reduced={reduced} />

            <div className="pt-2">
              <ol className="space-y-1" aria-label="Capabilities">
                {shown.map((c, i) => (
                  <StepRow
                    key={c.key}
                    capability={c}
                    index={i}
                    active={i === active}
                    running={running && i === active}
                    dwellMs={DWELL_MS}
                    onSelect={() => {
                      setUserPaused(true);
                      goTo(i);
                    }}
                  />
                ))}
              </ol>

              <div className="mt-6 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUserPaused((p) => !p)}
                  aria-pressed={userPaused}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stroke px-3 py-1.5 text-xs font-medium text-text-color-secondary transition-colors hover:border-primary hover:text-primary"
                >
                  {userPaused || reduced ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {userPaused || reduced ? "Play" : "Pause"}
                </button>
                <p className="text-xs text-text-color-tertiary">
                  {reduced ? "Pick a capability to view it." : "Or use ← → to step through."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile: stacked, static, callouts as prose ──────────────────────── */}
        <div className="space-y-12 lg:hidden">
          {shown.map((c) => (
            <Reveal key={c.key}>
              <div>
                <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-wide text-primary">
                  {c.eyebrow}
                </span>
                <h3 className="mb-4 text-2xl font-bold !leading-[1.2] text-title-color">{c.title}</h3>
                <Frame>
                  <Shot capability={c} />
                </Frame>
                <ul className="mt-5 space-y-3">
                  {c.callouts.map((a) => (
                    <li key={a.title}>
                      <p className="text-base font-semibold text-title-color">{a.title}</p>
                      <p className="text-sm !leading-normal text-text-color-secondary">{a.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The screenshot frame — same recipe as NotableFeatureRow so the two sections match. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border-[6px] border-white bg-white shadow-feature ring-1 ring-[#E4E7EC]">
      {children}
    </div>
  );
}

/**
 * One capability's screenshot, sized from the capture manifest. Falls back to a plain box if the
 * manifest has no entry yet, so the section renders before the pipeline has been run.
 */
function Shot({ capability, priority = false }: { capability: Capability; priority?: boolean }) {
  // isCaptured() already filtered these, so a missing entry here is impossible in practice —
  // returning null keeps the component total rather than rendering a developer-facing placeholder.
  const meta = screens[capability.screen];
  if (!meta?.width || !meta?.height) return null;
  return (
    <Image
      src={meta.file}
      alt={meta.alt}
      width={meta.width}
      height={meta.height}
      priority={priority}
      className="h-auto w-full"
    />
  );
}

/** The sticky stage: the active screenshot with its callouts drawing on in sequence. */
function Stage({
  capability,
  runId,
  reduced,
}: {
  capability: Capability;
  runId: number;
  reduced: boolean;
}) {
  return (
    <div className="sticky top-28">
      {/* keyed on the capability so the swap remounts (and re-fades) the image */}
      <div key={capability.key} className="relative animate-fade-up">
        <Frame>
          <Shot capability={capability} priority />
        </Frame>
        {capability.callouts.map((c, i) => (
          <Callout
            key={`${runId}:${c.title}`}
            x={c.x}
            y={c.y}
            title={c.title}
            body={c.body}
            side={c.side}
            delayMs={reduced ? 0 : CALLOUT_LEAD_MS + i * CALLOUT_STAGGER_MS}
            instant={reduced}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The countdown fill inside a step's track.
 *
 * Needs two committed frames to animate: setting width to 100% in the same commit that mounts the
 * element gives the browser no start value to interpolate from, so it would snap. Hence the rAF flip
 * from 0% → 100%, restarted whenever this step starts running.
 */
function ProgressFill({ active, running, dwellMs }: { active: boolean; running: boolean; dwellMs: number }) {
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!active) {
      setFilled(false);
      return;
    }
    if (!running) {
      // Selected but paused (or reduced motion): show it complete rather than creeping.
      setFilled(true);
      return;
    }
    setFilled(false);
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [active, running]);

  return (
    <span
      className="block h-full rounded-full bg-primary"
      style={{
        width: filled ? "100%" : "0%",
        transition: running && filled ? `width ${dwellMs}ms linear` : "width .2s ease",
      }}
    />
  );
}

/**
 * A step in the rail. The progress track is the "small grey text that grows and thickens on hover"
 * — a hairline rule that thickens and gains contrast on hover/active, filling left-to-right over the
 * dwell while this step is the running one.
 */
function StepRow({
  capability,
  index,
  active,
  running,
  dwellMs,
  onSelect,
}: {
  capability: Capability;
  index: number;
  active: boolean;
  running: boolean;
  dwellMs: number;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "step" : undefined}
        className="group block w-full py-3 text-left"
      >
        <span className="flex items-baseline gap-2.5">
          <span
            className={`text-xs tabular-nums transition-colors ${
              active ? "text-primary" : "text-text-color-tertiary group-hover:text-text-color-secondary"
            }`}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className={`text-lg font-semibold transition-colors ${
              active ? "text-title-color" : "text-text-color-secondary group-hover:text-title-color"
            }`}
          >
            {capability.title}
          </span>
        </span>

        {/* Track: 1px and faint at rest, 3px and darker on hover or when active. */}
        <span
          aria-hidden
          className={`mt-2.5 block w-full overflow-hidden rounded-full bg-stroke transition-all duration-200 ${
            active ? "h-[3px] bg-gray-200" : "h-px group-hover:h-[3px] group-hover:bg-gray-200"
          }`}
        >
          <ProgressFill active={active} running={running} dwellMs={dwellMs} />
        </span>

        <span
          className={`mt-2 block text-sm !leading-normal transition-opacity ${
            active ? "text-text-color-secondary opacity-100" : "text-text-color-tertiary opacity-70"
          }`}
        >
          {capability.blurb}
        </span>
      </button>
    </li>
  );
}
