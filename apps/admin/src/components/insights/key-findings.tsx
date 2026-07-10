"use client";

import { useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import type { PollKeyFinding, PollQuestionRef } from "@/lib/api/insights";
import { FindingEvidence } from "@/components/insights/finding-evidence";
import { cn } from "@/lib/utils";

/**
 * The poll's headline findings, in the editorial register of upriselabs.org: a mono
 * uppercase eyebrow over a tight-tracked extrabold headline, a vermilion hairline, and
 * cards indexed by a large numeral rather than boxed in chrome.
 *
 * Each card opens onto the crosstabs that back it. The evidence is not decoration — it is
 * how a reader checks the sentence above it, and in two cases it shows the write-up's own
 * figure disagreeing with the estimates.
 *
 * The accent (`--poll-accent`) is ornament only — rules, numerals, the eyebrow. It is
 * never a data mark, so a vermilion numeral here cannot be misread as the "oppose" pole
 * of the charts further down the page.
 */
export function KeyFindings({
  findings,
  pollId,
  questions,
}: {
  findings: PollKeyFinding[];
  pollId: string;
  questions: PollQuestionRef[];
}) {
  if (findings.length === 0) return null;

  return (
    <section aria-labelledby="key-findings">
      <header className="border-t-2 border-poll-accent pt-4">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-poll-accent">What the numbers say</p>
        <h2
          id="key-findings"
          className="mt-2 text-3xl font-extrabold leading-[0.98] tracking-[-0.035em] text-foreground sm:text-4xl"
        >
          Key findings
        </h2>
      </header>

      <ol className="mt-6 grid gap-px overflow-hidden rounded-[4px] border border-border bg-border lg:grid-cols-2">
        {findings.map((f, i) => (
          <FindingCard key={f.heading} finding={f} index={i} pollId={pollId} questions={questions} />
        ))}
      </ol>
    </section>
  );
}

function FindingCard({
  finding,
  index,
  pollId,
  questions,
}: {
  finding: PollKeyFinding;
  index: number;
  pollId: string;
  questions: PollQuestionRef[];
}) {
  const [open, setOpen] = useState(false);
  const items = finding.evidence?.items ?? [];
  const hasEvidence = items.length > 0;
  const panelId = `finding-${index}-evidence`;

  // Expanding one card should not stretch its neighbour in the grid.
  return (
    <li className={cn("group relative bg-surface p-5", open && "lg:col-span-2")}>
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] bg-poll-accent transition-opacity",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
      <div className="flex items-start gap-4">
        <span aria-hidden className="font-mono text-sm font-semibold tabular-nums text-poll-accent">
          {String(index + 1).padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold leading-tight tracking-[-0.015em] text-foreground">
            {finding.heading}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{finding.body}</p>

          {hasEvidence ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                "mt-4 inline-flex items-center gap-2 rounded-full border border-poll-accent/40 px-4 py-2",
                "text-sm font-bold uppercase tracking-[0.08em] text-poll-accent transition-colors",
                open ? "bg-poll-accent/15" : "bg-poll-accent/[0.07] hover:bg-poll-accent/15",
              )}
            >
              <BarChart3 className="h-4 w-4" />
              {open ? "Hide the data" : `Show the data · ${items.length} exhibit${items.length === 1 ? "" : "s"}`}
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </button>
          ) : finding.questionCode ? (
            <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              {finding.questionCode}
            </span>
          ) : null}

          {open ? (
            <div id={panelId}>
              <FindingEvidence items={items} pollId={pollId} questions={questions} />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
