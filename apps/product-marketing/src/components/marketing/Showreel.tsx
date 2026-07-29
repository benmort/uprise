"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SCREENS from "../../../public/images/marketing/screens/screens.json";

/**
 * The showreel: a browser-framed stage that cross-fades through the product's real surfaces, with a
 * tab rail underneath where each tab states the pillar it shows and fills a progress bar over its
 * dwell.
 *
 * Self-contained and route-agnostic — it brings its own frame, rail and play/pause, sizes to its
 * container, and reads its captures from the `screens.json` manifest. Drop it into any marketing
 * surface; it was named `HeroShowreel` while it only ever sat in the homepage hero.
 *
 * Ported from the standalone homepage design, so the timings and proportions are deliberate: a 6 s
 * dwell, a 0.7 s cross-fade, the active tab tinted and its 2px bar filling linearly across the dwell.
 * A visitor can click a tab or use ← → to step, and pause outright. Reduced-motion users start
 * paused on the first slide with nothing moving.
 */

/** ms per slide when auto-advancing – matches the bar's fill duration exactly. */
const DWELL_MS = 6000;

type Slide = {
  key: string;
  /** Manifest key in `screens.json` – the surface this slide actually shows. */
  screen: string;
  /** The chrome bar's URL pill, so the frame names the surface on screen. */
  path: string;
  title: string;
  blurb: string;
};

/**
 * The four pillars, in the order a visitor meets them: talk to people, knock on their doors, know
 * who they are, then turn that into action.
 *
 * `screen` must be a real capture – `alt` comes from the manifest rather than from here, so a slide
 * can never claim to show one surface while displaying another. A slide whose capture is missing is
 * dropped rather than rendered as a placeholder, so `segments` appears only once
 * `pnpm marketing:shots` has captured it.
 */
const SLIDES: Slide[] = [
  {
    key: "comms",
    // Light again: this used to point at the `-dark` twin because the light `inbox` capture was an
    // ngrok error page, and `marketing:shots` has since been re-run against a live local env — the
    // light entry is now the real inbox. The frame around it is `bg-gray-50`, and the homepage it
    // sits on is light throughout, so the dark twin was the only dark block left in that band.
    screen: "inbox",
    path: "app.uprise.org.au/inbox",
    title: "Every channel, one shared inbox",
    blurb: "Texts, WhatsApp and calls in one queue, claimed so nobody doubles up.",
  },
  {
    key: "canvassing",
    screen: "turf",
    path: "app.uprise.org.au/canvass/turf",
    title: "Cut turf, then walk it",
    blurb: "Split a suburb by door count, send route-ordered lists to phones.",
  },
  {
    key: "data",
    // Likewise re-captured: the light `demographics` entry is the same choropleth in the light
    // theme, not the placeholder the old note described.
    screen: "demographics",
    path: "app.uprise.org.au/data/demographics",
    title: "The whole country, already loaded",
    blurb: "ABS census, electoral boundaries and polling – no procurement, no import.",
  },
  {
    key: "actions",
    // The public action page, not the segments screen that sits behind it. This slide's claim starts
    // at the signature, and a petition with a live count toward its goal shows that; a list of
    // segment rules is the same story told from the operator's end, after the interesting part.
    // `petition` is hand-supplied rather than captured — see the note on its screens.json entry.
    screen: "petition",
    path: "campaign.org.au/hands-off-treaty",
    title: "Turn a signature into a shift",
    blurb: "Forms, petitions and surveys feed segments you can text the same day.",
  },
];

type ScreenMeta = { file: string; width: number | null; height: number | null; alt: string };
// The manifest also carries a leading `_comment`, so it can't be asserted straight to a
// Record<string, ScreenMeta> — go via unknown and let the lookup guard on width/height.
const screens = SCREENS as unknown as Record<string, ScreenMeta | undefined>;

/** A slide is showable only when its capture exists with real dimensions and alt text. */
function isCaptured(s: Slide): boolean {
  const m = screens[s.screen];
  return Boolean(m?.file && m?.alt && m.width && m.height);
}

export default function Showreel() {
  const shown = useMemo(() => SLIDES.filter(isCaptured), []);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  // Bumped on every advance so the active tab's bar restarts its fill from zero.
  const [runId, setRunId] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Only run the timer while the frame is on screen. An unseen reel burning through its slides
  // means the visitor arrives mid-sequence with no idea what they missed.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = inView && !paused && !reduced && shown.length > 1;

  const goTo = useCallback(
    (i: number) => {
      if (shown.length === 0) return;
      setActive(((i % shown.length) + shown.length) % shown.length);
      setRunId((r) => r + 1);
    },
    [shown.length],
  );

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => goTo(active + 1), DWELL_MS);
    return () => clearTimeout(t);
  }, [running, active, goTo]);

  // Arrow keys step the reel, but only while it is actually in view — otherwise a visitor reading
  // further down the page would silently reshuffle a reel they cannot see.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!inView) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      e.preventDefault();
      goTo(active + (e.key === "ArrowRight" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goTo, inView]);

  const current = shown[active];

  // Nothing captured yet — render nothing rather than an empty browser frame.
  if (!current) return null;

  return (
    <div className="text-left">
      <div className="overflow-hidden rounded-2xl border border-stroke-secondary bg-white shadow-[0_60px_100px_-50px_rgba(12,14,18,0.5)]">
        {/* Browser chrome: the URL pill tracks the active slide, so the frame names the surface
            on screen instead of claiming one fixed route for all four. */}
        <div className="flex items-center gap-2 border-b border-stroke-secondary bg-gray-50 px-4 py-3">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-gray-200" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-gray-200" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-gray-200" />
          <span className="ml-3 min-w-0 truncate rounded-md border border-stroke-secondary bg-white px-3 py-1 font-mono text-[11px] text-text-color-tertiary">
            {current.path}
          </span>
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 font-mono text-[11px] text-text-color-tertiary sm:inline-flex">
            <span aria-hidden className="h-[7px] w-[7px] animate-live-pulse rounded-full bg-success-500" />
            LIVE
          </span>
        </div>

        {/* The stage. Every capture is stacked and cross-faded, so a step never shows a gap while
            the next image decodes. */}
        <div ref={stageRef} className="relative aspect-video bg-gray-50">
          {shown.map((s, i) => {
            const meta = screens[s.screen];
            if (!meta?.width || !meta?.height) return null;
            return (
              <Image
                key={s.key}
                src={meta.file}
                alt={meta.alt}
                fill
                sizes="(min-width: 1100px) 1100px, 100vw"
                priority={i === 0}
                aria-hidden={i !== active}
                className={`object-cover object-top transition-opacity duration-700 ease-out ${
                  i === active ? "opacity-100" : "opacity-0"
                }`}
              />
            );
          })}
        </div>

        {/* The tab rail. Four across from sm; two-up on a phone, where four columns of 13px copy
            would be unreadable. */}
        <div className="grid grid-cols-1 border-t border-stroke-secondary sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setPaused(true);
                goTo(i);
              }}
              aria-current={i === active ? "true" : undefined}
              className={`flex flex-col gap-[5px] border-b border-stroke-secondary px-6 py-5 text-left transition-colors last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:[&:nth-child(2)]:border-r ${
                i === active ? "bg-primary-25" : "bg-white hover:bg-gray-50"
              }`}
            >
              <span className="font-mono text-[11px] tracking-[0.12em] text-text-color-tertiary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-base font-semibold text-title-color">{s.title}</span>
              <span className="text-[13px] !leading-normal text-text-color-secondary">{s.blurb}</span>
              <span aria-hidden className="mt-1 block h-[2px] w-full overflow-hidden rounded-full">
                <ProgressFill active={i === active} running={running} runId={runId} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3.5 pt-4.5">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="inline-flex items-center gap-2 rounded-full border border-stroke-secondary bg-white px-4 py-2 text-[13px] font-semibold text-text-color-secondary transition-colors hover:border-title-color hover:text-title-color"
        >
          {paused || reduced ? "Play" : "Pause"}
        </button>
        <span className="text-[13px] text-text-color-tertiary">Or use ← → to step through.</span>
      </div>
    </div>
  );
}

/**
 * The active tab's countdown bar.
 *
 * Needs two committed frames to animate: setting the width to 100% in the same commit that mounts
 * the element gives the browser no start value to interpolate from, so it would snap. Hence the rAF
 * flip from 0% → 100%, restarted by `runId` on every advance.
 */
function ProgressFill({ active, running, runId }: { active: boolean; running: boolean; runId: number }) {
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
  }, [active, running, runId]);

  return (
    <span
      className="block h-full rounded-full bg-primary"
      style={{
        width: filled ? "100%" : "0%",
        transition: running && filled ? `width ${DWELL_MS}ms linear` : "width .2s ease",
      }}
    />
  );
}
