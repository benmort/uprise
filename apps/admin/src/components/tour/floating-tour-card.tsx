"use client";

import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { navigateAndWait, tourScroll } from "@/lib/tours/uprise-tour";
import { AUTO_DWELL_MS, useUpriseTour } from "@/lib/tours/use-uprise-tour";

// ─── Layout constants ────────────────────────────────────────────────────────
const CARD_W = 320;
const CARD_H = 268;
const ARROW_H = 10;
const ARROW_W = 22;
const GAP = ARROW_H + 6;
const SPOTLIGHT_PAD = 10;
const MARGIN = 16;
const DIM_OPACITY = 0.6;
const ANIMATE_MS = 180;

type Side = "above" | "below" | "right" | "left" | "none";

interface CardPosition {
  x: number;
  y: number;
}
interface TargetInfo {
  pos: CardPosition;
  side: Side;
  rect: DOMRect;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function computeTargetInfo(rect: DOMRect, forceAbove = false): TargetInfo {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = clamp(rect.left + rect.width / 2 - CARD_W / 2, MARGIN, vw - CARD_W - MARGIN);
  const ay = clamp(rect.top, MARGIN, vh - CARD_H - MARGIN);

  if (forceAbove) {
    return {
      pos: { x: cx, y: clamp(rect.top - GAP - CARD_H, MARGIN, vh - CARD_H - MARGIN) },
      side: "above",
      rect,
    };
  }

  if (rect.top - GAP - CARD_H >= MARGIN)
    return { pos: { x: cx, y: rect.top - GAP - CARD_H }, side: "above", rect };
  if (rect.bottom + GAP + CARD_H + MARGIN <= vh)
    return { pos: { x: cx, y: rect.bottom + GAP }, side: "below", rect };
  if (rect.right + GAP + CARD_W + MARGIN <= vw)
    return { pos: { x: rect.right + GAP, y: ay }, side: "right", rect };
  if (rect.left - GAP - CARD_W >= MARGIN)
    return { pos: { x: rect.left - GAP - CARD_W, y: ay }, side: "left", rect };

  return { pos: { x: vw - CARD_W - MARGIN, y: MARGIN + 64 }, side: "none", rect };
}

// ─── Arrow ───────────────────────────────────────────────────────────────────
function Arrow({ side }: { side: Side }) {
  if (side === "none") return null;

  const fill = "hsl(var(--background))";
  const stroke = "hsl(var(--border))";
  const s: React.CSSProperties = { position: "absolute", display: "block" };

  switch (side) {
    case "above":
      return (
        <svg
          style={{ ...s, bottom: -ARROW_H, left: CARD_W / 2 - ARROW_W / 2 }}
          width={ARROW_W}
          height={ARROW_H}
          overflow="visible"
        >
          <polygon points={`0,0 ${ARROW_W},0 ${ARROW_W / 2},${ARROW_H}`} style={{ fill: stroke }} />
          <polygon points={`1,0 ${ARROW_W - 1},0 ${ARROW_W / 2},${ARROW_H - 1.5}`} style={{ fill }} />
        </svg>
      );
    case "below":
      return (
        <svg
          style={{ ...s, top: -ARROW_H, left: CARD_W / 2 - ARROW_W / 2 }}
          width={ARROW_W}
          height={ARROW_H}
          overflow="visible"
        >
          <polygon
            points={`0,${ARROW_H} ${ARROW_W},${ARROW_H} ${ARROW_W / 2},0`}
            style={{ fill: stroke }}
          />
          <polygon
            points={`1,${ARROW_H} ${ARROW_W - 1},${ARROW_H} ${ARROW_W / 2},1.5`}
            style={{ fill }}
          />
        </svg>
      );
    case "right":
      return (
        <svg
          style={{ ...s, left: -ARROW_H, top: CARD_H / 2 - ARROW_W / 2 }}
          width={ARROW_H}
          height={ARROW_W}
          overflow="visible"
        >
          <polygon
            points={`${ARROW_H},0 ${ARROW_H},${ARROW_W} 0,${ARROW_W / 2}`}
            style={{ fill: stroke }}
          />
          <polygon
            points={`${ARROW_H - 1},1 ${ARROW_H - 1},${ARROW_W - 1} 1.5,${ARROW_W / 2}`}
            style={{ fill }}
          />
        </svg>
      );
    case "left":
      return (
        <svg
          style={{ ...s, right: -ARROW_H, top: CARD_H / 2 - ARROW_W / 2 }}
          width={ARROW_H}
          height={ARROW_W}
          overflow="visible"
        >
          <polygon points={`0,0 0,${ARROW_W} ${ARROW_H},${ARROW_W / 2}`} style={{ fill: stroke }} />
          <polygon points={`1,1 1,${ARROW_W - 1} ${ARROW_H - 1.5},${ARROW_W / 2}`} style={{ fill }} />
        </svg>
      );
  }
}

// ─── Spotlight overlay ────────────────────────────────────────────────────────
function SpotlightOverlay({
  rect,
  overlayVisible,
  interactive,
  onClose,
}: {
  rect: DOMRect | null;
  overlayVisible: boolean;
  interactive: boolean;
  onClose: () => void;
}) {
  if (!rect) return null;
  const p = SPOTLIGHT_PAD;
  return (
    <svg
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        pointerEvents: interactive ? "none" : "all",
        cursor: "default",
        opacity: overlayVisible ? 1 : 0,
        transition: `opacity ${ANIMATE_MS}ms ease`,
      }}
      onClick={
        interactive
          ? undefined
          : (e) => {
              e.stopPropagation();
              onClose();
            }
      }
      width="100vw"
      height="100vh"
    >
      <defs>
        <mask id="uprise-tour-spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect
            style={{
              transition: "x 250ms ease, y 250ms ease, width 250ms ease, height 250ms ease",
            }}
            x={rect.left - p}
            y={rect.top - p}
            width={rect.width + p * 2}
            height={rect.height + p * 2}
            rx="6"
            fill="black"
          />
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`rgba(0,0,0,${DIM_OPACITY})`}
        mask="url(#uprise-tour-spotlight-mask)"
      />
    </svg>
  );
}

// ─── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({
  total,
  current,
  mode,
  paused,
  dwellMs,
}: {
  total: number;
  current: number;
  mode: "manual" | "auto";
  paused: boolean;
  dwellMs: number;
}) {
  const base = total > 0 ? current / total : 0;
  const target = total > 0 ? (current + 1) / total : 0;
  const timing = mode === "auto" && !paused;
  const [width, setWidth] = useState(base);

  useEffect(() => {
    setWidth(base);
    if (!timing) {
      const id = requestAnimationFrame(() => setWidth(target));
      return () => cancelAnimationFrame(id);
    }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setWidth(target)));
    return () => cancelAnimationFrame(id);
  }, [current, timing, base, target]);

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Step {current + 1} of {total}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{
          backgroundColor:
            "color-mix(in srgb, hsl(var(--surface-variant)) 78%, hsl(var(--primary)))",
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width * 100}%`,
            backgroundColor: "hsl(var(--primary))",
            transition: timing
              ? `width ${dwellMs}ms linear`
              : "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function FloatingTourCard() {
  const {
    active,
    step,
    currentStep,
    totalSteps,
    mode,
    paused,
    next,
    prev,
    skipToEnd,
    pauseAuto,
    resumeAuto,
    switchToManual,
    close,
  } = useUpriseTour();

  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const dragging = useRef(false);
  const dragOffset = useRef<CardPosition>({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (active) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
  }, [active]);

  // On each step: navigate to its route (if any), run its onEnter, wait for the page,
  // scroll the target into view, then measure for the spotlight + card placement.
  useEffect(() => {
    if (!active || !step) {
      setTarget(null);
      return;
    }
    let cancelled = false;

    if (step.route) {
      const r = typeof step.route === "function" ? step.route() : step.route;
      tourScroll.ready = navigateAndWait(r);
    }
    // A step's onEnter may override tourScroll.ready (e.g. seed data, then navigate).
    step.onEnter?.();

    const pending = tourScroll.ready;
    const overlay = !!step.overlay;
    const selector = step.selector;
    const delays = [40, 140, 280, 460, 700, 1000, 1400];

    void pending.then(async () => {
      for (const d of delays) {
        await new Promise<void>((r) => setTimeout(r, d));
        if (cancelled) return;
        const el = selector ? document.querySelector(selector) : null;
        if (el) {
          const r0 = el.getBoundingClientRect();
          const needsScroll = r0.top < 72 || r0.bottom > window.innerHeight - 72;
          if (needsScroll) {
            el.scrollIntoView({ block: "center", inline: "nearest" });
            await new Promise<void>((r) => setTimeout(r, 180));
            if (cancelled) return;
          }
          setTarget(computeTargetInfo(el.getBoundingClientRect(), overlay));
          return;
        }
      }
      if (!cancelled) setTarget(null);
    });
    return () => {
      cancelled = true;
    };
  }, [active, step, currentStep]);

  const handleClose = useCallback(() => {
    setVisible(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => close(), ANIMATE_MS);
  }, [close]);

  // Keyboard navigation — capture phase so Escape is consumed before page listeners.
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        handleClose();
      }
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [active, next, prev, handleClose]);

  // Drag — header only
  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!cardRef.current || !target) return;
      dragging.current = true;
      dragOffset.current = { x: e.clientX - target.pos.x, y: e.clientY - target.pos.y };
      cardRef.current.setPointerCapture(e.pointerId);
    },
    [target],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setTarget((p) =>
      p
        ? {
            ...p,
            pos: {
              x: Math.max(0, e.clientX - dragOffset.current.x),
              y: Math.max(0, e.clientY - dragOffset.current.y),
            },
            side: "none",
          }
        : null,
    );
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  if (!mounted || !active || !step) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const Icon = step.icon;
  const pos = target?.pos ?? { x: 24, y: 80 };
  const side = target?.side ?? "none";
  const isOverlayStep = !!step.overlay;

  return createPortal(
    <>
      <SpotlightOverlay
        rect={target?.rect ?? null}
        overlayVisible={visible}
        interactive={isOverlayStep}
        onClose={handleClose}
      />

      <div
        ref={cardRef}
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 9999,
          width: CARD_W,
          pointerEvents: "auto",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(6px)",
          transition: `opacity ${ANIMATE_MS}ms ease, transform ${ANIMATE_MS}ms ease`,
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Arrow side={side} />

        <div className="overflow-hidden rounded-xl border bg-background shadow-2xl">
          {/* Header — drag handle */}
          <div
            className="flex cursor-grab select-none items-start gap-2.5 px-4 pb-2 pt-4 active:cursor-grabbing"
            onPointerDown={onHeaderPointerDown}
          >
            {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{step.title}</p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close tour"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <ProgressBar
            total={totalSteps}
            current={currentStep}
            mode={mode}
            paused={paused}
            dwellMs={step.dwellMs ?? AUTO_DWELL_MS}
          />

          {/* Content — fades when step changes */}
          <div key={currentStep} style={{ animation: "upriseTourFadeIn 150ms ease both" }}>
            <p className="px-4 text-[13px] font-medium leading-snug text-foreground">{step.content}</p>
            {step.detail ? (
              <>
                <hr className="mx-4 my-2.5 border-t border-[hsl(var(--border))]" />
                <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
              </>
            ) : (
              <div className="pb-3" />
            )}
          </div>

          {/* Controls */}
          {step.tldr ? (
            <div
              className="flex items-center justify-between gap-2 border-t px-4 py-2.5"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Button variant="ghost" className="h-7 gap-1 text-xs" onClick={skipToEnd}>
                Skip the TLDR
              </Button>
              <Button className="h-7 gap-1 text-xs" onClick={next}>
                Walk me through it
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : mode === "auto" ? (
            <div
              className="flex items-center justify-between border-t px-4 py-2.5"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Button className="h-7 gap-1 text-xs" onClick={paused ? resumeAuto : pauseAuto}>
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {paused ? "Resume" : "Auto-playing…"}
              </Button>
              <Button variant="ghost" className="h-7 gap-1 text-xs" onClick={switchToManual}>
                Switch to manual
              </Button>
            </div>
          ) : (
            <div
              className="flex items-center justify-between border-t px-4 py-2.5"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                className="h-7 gap-1 text-xs"
                disabled={isFirst}
                onClick={prev}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              <Button className="h-7 gap-1 text-xs" onClick={next}>
                {isLast ? "Finish" : "Next"}
                {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes upriseTourFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>,
    document.body,
  );
}
