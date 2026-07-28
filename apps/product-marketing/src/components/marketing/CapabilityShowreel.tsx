"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
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
 * The capability walkthrough: a sticky screenshot stage that advances through the product's real
 * surfaces, drawing annotation callouts onto each one in sequence. Lives in the hero, which supplies
 * the surrounding heading, width and background — this renders the reel and nothing else.
 *
 * Auto-advances, but yields to the visitor — it pauses on hover, on keyboard focus within, when
 * scrolled out of view, and permanently once they touch a control. Reduced-motion users get no
 * auto-advance, no slide and all callouts at once. Below `lg` the sticky stage is dropped entirely
 * for a plain stacked list, because a pinned stage on a short phone viewport is a trap.
 */
export default function CapabilityShowreel() {
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
    <div
      ref={sectionRef}
      className="text-left"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      onKeyDown={onKeyDown}
    >
      {/* One capability at a time — stage above the words on a phone, beside them from lg. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        <Stage capability={current} runId={runId} reduced={reduced} />

        {/* Keyed on the capability so the whole panel remounts and re-fades on every step. */}
        <div key={current.key} className="animate-fade-up lg:pt-2">
          <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-wide text-primary">
            {current.eyebrow}
          </span>
          <h3 className="text-2xl font-bold !leading-[1.15] text-title-color md:text-3xl">
            {current.title}
          </h3>
          <p className="mt-3 text-base !leading-normal text-text-color-secondary">{current.blurb}</p>

          {/* The callouts are pinned to the screenshot from lg (see Stage); below that there is no
              room to point at anything, so they read as prose instead of vanishing. */}
          <ul className="mt-5 space-y-3 lg:hidden">
            {current.callouts.map((a) => (
              <li key={a.title}>
                <p className="text-base font-semibold text-title-color">{a.title}</p>
                <p className="text-sm !leading-normal text-text-color-secondary">{a.body}</p>
              </li>
            ))}
          </ul>

          <StepProgress
            capabilities={shown}
            active={active}
            running={running}
            dwellMs={DWELL_MS}
            onSelect={(i) => {
              setUserPaused(true);
              goTo(i);
            }}
          />

          <div className="mt-4 flex items-center gap-2">
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
  );
}

/**
 * The step indicator: one slim segment per capability, the active one filling over its dwell. It
 * replaces a rail that listed every step at once — with the panel above showing only the active
 * capability, this is what tells you how many there are and where you are among them.
 */
function StepProgress({
  capabilities,
  active,
  running,
  dwellMs,
  onSelect,
}: {
  capabilities: Capability[];
  active: number;
  running: boolean;
  dwellMs: number;
  onSelect: (i: number) => void;
}) {
  return (
    <ol className="mt-7 flex items-center gap-2" aria-label="Capabilities">
      {capabilities.map((c, i) => (
        <li key={c.key} className="relative flex-1">
          <button
            type="button"
            onClick={() => onSelect(i)}
            aria-current={i === active ? "step" : undefined}
            aria-label={c.title}
            className="group block w-full py-2"
          >
            {/* The label rides above the segment on hover/focus, so a visitor can tell what they're
                about to jump to instead of picking a numbered bar blind. Pointer-events-none keeps
                it from stealing the hover it was opened by. */}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-title-color px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-feature transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
            >
              {c.title}
              <span
                aria-hidden
                className="absolute left-1/2 top-full -ml-1 border-4 border-transparent border-t-title-color"
              />
            </span>

            {/* Every segment keeps a visible track: a hairline for the steps still to come reads as
                empty space, and then the row can't say how many capabilities there are. */}
            <span
              className={`block w-full overflow-hidden rounded-full transition-all duration-200 ${
                i === active
                  ? "h-[3px] bg-gray-200"
                  : "h-[2px] bg-gray-200 group-hover:h-[5px] group-hover:bg-gray-300 group-focus-visible:h-[5px]"
              }`}
            >
              {/* Steps already shown stay filled, so the row reads as progress, not as a menu. */}
              {i < active ? (
                <span className="block h-full w-full rounded-full bg-primary opacity-40 transition-opacity duration-200 group-hover:opacity-70" />
              ) : (
                <ProgressFill active={i === active} running={running} dwellMs={dwellMs} />
              )}
            </span>
          </button>
        </li>
      ))}
    </ol>
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

/** The stage: the active screenshot with its callouts drawing on in sequence. */
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
    // keyed on the capability so the swap remounts (and re-fades) the image
    <div key={capability.key} className="relative animate-fade-up">
      <Frame>
        <Shot capability={capability} priority />
      </Frame>
      {/* Pinned annotations need room to sit beside the shot; below lg the panel prints them as
          prose instead. The wrapper is static, so each Callout still anchors to the frame above. */}
      <div className="hidden lg:block">
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

