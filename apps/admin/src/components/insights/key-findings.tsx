import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PollKeyFinding } from "@/lib/api/insights";

/**
 * The poll's headline findings, in the editorial register of upriselabs.org: a mono
 * uppercase eyebrow over a tight-tracked extrabold headline, a vermilion hairline, and
 * cards indexed by a large numeral rather than boxed in chrome.
 *
 * The accent (`--poll-accent`) is ornament only — rules, numerals, the eyebrow. It is
 * never a data mark, so a vermilion numeral here cannot be misread as the "oppose" pole
 * of the charts further down the page.
 */
export function KeyFindings({ findings, pollId }: { findings: PollKeyFinding[]; pollId: string }) {
  if (findings.length === 0) return null;

  return (
    <section aria-labelledby="key-findings">
      <header className="border-t-2 border-poll-accent pt-4">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-poll-accent">
          What the numbers say
        </p>
        <h2
          id="key-findings"
          className="mt-2 text-3xl font-extrabold leading-[0.98] tracking-[-0.035em] text-foreground sm:text-4xl"
        >
          Key findings
        </h2>
      </header>

      <ol className="mt-6 grid gap-px overflow-hidden rounded-[4px] border border-border bg-border sm:grid-cols-2">
        {findings.map((f, i) => (
          <li key={f.heading} className="group relative bg-surface p-5 transition-colors hover:bg-surface-variant/40">
            {/* The accent bar reads as an index rail, and only lights on hover so a
                page of eight cards does not become eight competing stripes. */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px] bg-poll-accent opacity-0 transition-opacity group-hover:opacity-100"
            />
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="font-mono text-sm font-semibold tabular-nums text-poll-accent"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold leading-tight tracking-[-0.015em] text-foreground">
                  {f.heading}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                {f.questionCode ? (
                  <Link
                    href={`/insights/${pollId}/questions/${f.questionCode}`}
                    className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-poll-accent"
                  >
                    {f.questionCode}
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
