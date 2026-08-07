"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { gapsBetween, humaniseGap, ribbonOffsets, type Cycle } from "@/lib/queue-firehose";

/**
 * The cycle ribbon — this surface's one bold element, and the reason it exists.
 *
 * A progress bar answers "how far along?". A queue job's real question is "is it still beating, and
 * when is the next beat?" — and for a job on an exponential backoff the honest answer can be
 * "in nine days". Beats are spaced by the LOG of elapsed time, so a widening gap reads as beats
 * drifting apart: you see the job going quiet rather than being told a percentage that never moves.
 *
 * Everything else on the page is deliberately quiet so this is the thing you look at.
 */

/** Track inset, so the first and last beats sit inside the card rather than half-clipped by it. */
const INSET = 5;

export function CycleRibbon({ cycles, nextRunAt }: { cycles: Cycle[]; nextRunAt?: number }) {
  // Absolute and relative times are computed after mount. Rendering them during SSR produces a
  // different string on the server (different locale and a different `now`), which React reports
  // as a hydration mismatch and repairs by throwing away the server HTML.
  const [nextRunLabel, setNextRunLabel] = useState<{ absolute: string; away: string } | null>(null);
  useEffect(() => {
    if (!nextRunAt) return;
    setNextRunLabel({
      absolute: new Date(nextRunAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
      away: humaniseGap(nextRunAt - Date.now()),
    });
  }, [nextRunAt]);

  if (cycles.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No cycles yet. The first attempt appears here the moment the worker claims it.
      </p>
    );
  }

  const offsets = ribbonOffsets(cycles);
  const gaps = gapsBetween(cycles);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Cycles</h3>
        {/* A chart that silently rescales time is a chart that lies. Say the scale out loud. */}
        <span className="text-[11px] text-muted-foreground">segment width ∝ length of the wait · log scale</span>
      </div>

      <div className="relative mt-6 h-28">
        <div className="absolute inset-x-0 top-3 h-px bg-border" style={{ left: `${INSET}%`, right: `${INSET}%` }} />

        {cycles.map((cycle, i) => {
          // Map 0–1 onto the inset track so the edge beats keep their labels on-card.
          const left = `${INSET + offsets[i] * (100 - INSET * 2)}%`;
          const waiting = cycle.outcome === "waiting";
          const running = cycle.outcome === "running";
          const failed = cycle.outcome === "failed";
          // Two label rows. Alternating stops adjacent beats overlapping when the log scale
          // bunches them, which it does precisely where the action is.
          const lowered = i % 2 === 1;

          return (
            <div
              key={`${cycle.attempt}-${cycle.at}`}
              className="absolute top-0 flex w-28 -translate-x-1/2 flex-col items-center"
              style={{ left }}
            >
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 bg-surface text-[10px] font-bold tabular-nums",
                  failed && "border-error text-error",
                  running && "border-primary text-primary",
                  waiting && "border-dashed border-muted-foreground/50 text-muted-foreground",
                  cycle.outcome === "advanced" && "border-success text-success",
                )}
              >
                {cycle.attempt}
              </span>

              <span
                className={cn(
                  "mt-2 flex flex-col items-center text-center text-[11px] leading-tight",
                  lowered && "mt-9",
                )}
              >
                {/* The gap line is always reserved, blank on the first beat, so every label
                    shares a baseline instead of stepping up and down. */}
                <span className="h-4 font-semibold tabular-nums text-foreground">
                  {i > 0 ? `+${humaniseGap(gaps[i])}` : ""}
                </span>
                <span className={cn(failed ? "text-error" : "text-muted-foreground")}>
                  {failed
                    ? "failed"
                    : running
                      ? (cycle.detail ?? "running")
                      : waiting
                        ? "next attempt"
                        : (cycle.detail ?? "ok")}
                </span>
              </span>

              {running ? (
                <span className="mt-1 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>

      {nextRunAt ? (
        <p className="mt-2 text-xs text-muted-foreground" suppressHydrationWarning>
          {nextRunLabel ? (
            <>
              Next attempt <span className="font-semibold text-foreground">{nextRunLabel.absolute}</span> —{" "}
              {nextRunLabel.away} away.
            </>
          ) : (
            "Next attempt scheduled."
          )}
        </p>
      ) : null}
    </div>
  );
}
