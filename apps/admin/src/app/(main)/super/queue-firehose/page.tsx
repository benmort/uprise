"use client";

/**
 * Queue firehose — design prototype.
 *
 * Replaces "Sync queued (job cmsi3zl3). Tracking progress…", a string that names a thing nobody can
 * look up and then says nothing further. During a real incident it sat there for hours while the
 * worker picked the job up and died on every attempt.
 *
 * Three ideas, in the order the eye should hit them:
 *
 *   1. THE READ. Every queue is interpreted on load and answers in one word plus two sentences —
 *      what is happening and what to do. The verdict is the headline; the job id is a footnote.
 *   2. THE RIBBON. Cycles spaced by real elapsed time, so an exponential backoff is visible as
 *      beats drifting apart. See `cycle-ribbon.tsx` — this is the one bold element.
 *   3. THE FIREHOSE. The raw lines underneath, in mono, for when the read is not enough. Two
 *      voices, two faces: what it means in the body face, what the machine actually said in mono.
 *
 * The left rail reuses the onboarding menu's language deliberately — same row rhythm, icon, label,
 * status chip — because "what still needs doing" and "what is running" are the same kind of glance.
 *
 * PROTOTYPE: data is `prototype-data.ts` and the reads are written, not generated. Wiring is
 * GET /observability/queue/jobs for the cycles and the AI service for the read.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Circle,
  Loader2,
  Radio,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { verdictOf, type Verdict } from "@/lib/queue-firehose";
import { QUEUES, type PrototypeQueue } from "./prototype-data";
import { CycleRibbon } from "./cycle-ribbon";

/** Verdict → the dot on the rail and the colour of the headline word. Nothing else is tinted. */
const VERDICT_TONE: Record<Verdict, { dot: string; word: string }> = {
  failing: { dot: "bg-error", word: "text-error" },
  stalled: { dot: "bg-warning-foreground", word: "text-warning-foreground" },
  working: { dot: "bg-primary", word: "text-primary" },
  healthy: { dot: "bg-success", word: "text-success" },
  idle: { dot: "bg-muted-foreground/40", word: "text-muted-foreground" },
};

function VerdictIcon({ verdict }: { verdict: Verdict }) {
  switch (verdict) {
    case "failing":
      return <AlertCircle className="h-5 w-5 text-error" />;
    case "stalled":
      return <Clock3 className="h-5 w-5 text-warning-foreground" />;
    case "working":
      return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    case "healthy":
      return <CheckCircle2 className="h-5 w-5 text-success" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground/50" />;
  }
}

export default function QueueFirehosePrototype() {
  const [activeKey, setActiveKey] = useState(QUEUES[0].key);
  // The reads arrive together, a beat after mount — the prototype's stand-in for interpreting every
  // queue on load. Staged rather than instant so the page shows what the waiting state looks like.
  const [readsReady, setReadsReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReadsReady(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const verdicts = useMemo(
    () => new Map(QUEUES.map((q) => [q.key, verdictOf(q.cycles)] as const)),
    [],
  );
  const active = QUEUES.find((q) => q.key === activeKey) as PrototypeQueue;
  const activeVerdict = verdicts.get(active.key) ?? "idle";
  const needsAttention = QUEUES.filter((q) => {
    const v = verdicts.get(q.key);
    return v === "failing" || v === "stalled";
  }).length;

  return (
    <div className="p-6">
      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Prototype</p>
        <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-extrabold text-foreground">
          <Radio className="h-6 w-6 text-primary" aria-hidden />
          Queue firehose
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {needsAttention > 0
            ? `${needsAttention} of ${QUEUES.length} queues need a look. Everything else is moving.`
            : "Every queue is moving."}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* ── Left rail: the onboarding menu's row rhythm, one row per queue ── */}
        <nav aria-label="Queues" className="rounded-2xl border border-border bg-surface p-2 shadow-card lg:sticky lg:top-4 lg:self-start">
          <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Queues
          </p>
          {QUEUES.map((queue) => {
            const verdict = verdicts.get(queue.key) ?? "idle";
            const selected = queue.key === active.key;
            return (
              <button
                key={queue.key}
                type="button"
                onClick={() => setActiveKey(queue.key)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  selected ? "bg-surface-variant" : "hover:bg-surface-variant",
                )}
              >
                <VerdictIcon verdict={verdict} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{queue.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{queue.subtitle}</span>
                </span>
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", VERDICT_TONE[verdict].dot)}
                  aria-hidden
                />
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          {/* ── The read: the verdict is the headline, the job id a footnote ── */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              What&apos;s happening
            </div>

            {!readsReady ? (
              <div className="mt-3 space-y-2" aria-live="polite" aria-busy="true">
                <div className="h-7 w-56 animate-pulse rounded-md bg-surface-variant" />
                <div className="h-4 w-full animate-pulse rounded bg-surface-variant" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-surface-variant" />
                <p className="pt-1 text-xs text-muted-foreground">Reading the last few cycles…</p>
              </div>
            ) : (
              <div className="mt-2 animate-fade-up" aria-live="polite">
                <h2 className={cn("text-2xl font-bold tracking-tight", VERDICT_TONE[activeVerdict].word)}>
                  {active.ai.verdictLabel}
                </h2>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-foreground">{active.ai.reading}</p>
                {active.ai.advice ? (
                  <p className="mt-2.5 max-w-2xl border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    {active.ai.advice}
                  </p>
                ) : null}
              </div>
            )}

            <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              {active.jobLabel} · attempt {active.attemptsMade} of {active.attemptsAllowed} ·{" "}
              <span className="font-mono">{active.jobId}</span>
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <CycleRibbon cycles={active.cycles} nextRunAt={active.nextRunAt} />
          </section>

          {/* ── The firehose: the machine's own voice, in the machine's own face ── */}
          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Firehose</h3>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden />
                live
              </span>
            </div>
            <ul className="divide-y divide-border/40">
              {active.events.map((event, i) => (
                <li key={`${event.at}-${i}`} className="flex gap-3 px-5 py-2.5 font-mono text-xs">
                  <span className="shrink-0 tabular-nums text-muted-foreground">{event.at}</span>
                  <span
                    className={cn(
                      "w-11 shrink-0 font-bold uppercase",
                      event.level === "error" && "text-error",
                      event.level === "warn" && "text-warning-foreground",
                      event.level === "info" && "text-muted-foreground",
                    )}
                  >
                    {event.level}
                  </span>
                  <span className="min-w-0 break-all text-foreground">{event.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
