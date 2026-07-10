"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3, ChevronRight } from "lucide-react";
import {
  fieldworkWindow,
  getPoll,
  provenanceLine,
  type PollDetail,
  type PollQuestionRef,
  type PollTheme,
} from "@/lib/api/insights";
import { chartKind, diverging, shift, topResponses } from "@/lib/insights/topline";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { KeyFindings } from "@/components/insights/key-findings";
import { PollVisibility } from "@/components/insights/poll-visibility";
import { CrosstabLink, PersuasionShift, ShiftHeadline } from "@/components/insights/persuasion-shift";
import { DivergingBar, DivergingLegend, DivergingNets, NominalBars } from "@/components/insights/diverging-bar";
import { SectionCard } from "@uprise/field";

/**
 * The two sheet-derived categories the ingest produces. Themes (the sub-grouping) are
 * labelled by the API, which owns the taxonomy; these two are all the page must name.
 */
const CATEGORY_LABEL: Record<string, string> = {
  treaty: "Treaty",
  polling_background: "Political context",
};
const categoryLabel = (c: string | null) =>
  c === null ? "Other questions" : (CATEGORY_LABEL[c] ?? c.replace(/_/g, " "));

export default function PollDetailPage() {
  const { pollId } = useParams<{ pollId: string }>();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/insights/polls/${pollId}`,
    () => getPoll(pollId),
    { ttlMs: 60_000 },
  );

  return (
    <PageShell icon={BarChart3} title={data?.title ?? "Poll"}>
      <Link
        href="/insights"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All polls
      </Link>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {data ? <PollBody poll={data} pollId={pollId} onChanged={() => void refetch()} /> : null}
      </StateRegion>
    </PageShell>
  );
}

/** A theme and the questions that fell into it, in the API's reading order. */
type ThemeBlock = { theme: PollTheme | null; category: string | null; questions: PollQuestionRef[] };

/**
 * Bucket questions by theme, then by category. A poll the API does not recognise ships
 * no themes at all, so every question lands in one untitled block per category and the
 * page still reads – just without the sub-grouping.
 */
function blocksOf(poll: PollDetail): Array<{ category: string | null; blocks: ThemeBlock[] }> {
  const byTheme = new Map<string, PollQuestionRef[]>();
  const untitled = new Map<string | null, PollQuestionRef[]>();

  for (const q of poll.questions) {
    if (q.theme) {
      byTheme.set(q.theme, [...(byTheme.get(q.theme) ?? []), q]);
    } else {
      untitled.set(q.category, [...(untitled.get(q.category) ?? []), q]);
    }
  }

  // `poll.themes` is already in reading order, so the categories fall out in that order.
  const blocks: ThemeBlock[] = poll.themes
    .filter((t) => byTheme.has(t.key))
    .map((t) => ({ theme: t, category: t.category, questions: byTheme.get(t.key)! }));

  for (const [category, questions] of untitled) blocks.push({ theme: null, category, questions });

  const order: Array<string | null> = [];
  for (const b of blocks) if (!order.includes(b.category)) order.push(b.category);

  return order.map((category) => ({ category, blocks: blocks.filter((b) => b.category === category) }));
}

function PollBody({ poll, pollId, onChanged }: { poll: PollDetail; pollId: string; onChanged: () => void }) {
  const grouped = blocksOf(poll);
  const href = (code: string) => `/insights/${pollId}/questions/${code}`;

  // The before/after pair, when the poll declares one and both sides are readable.
  const compareTheme = poll.themes.find((t) => t.compare);
  const before = compareTheme && poll.questions.find((q) => q.code === compareTheme.compare!.before);
  const after = compareTheme && poll.questions.find((q) => q.code === compareTheme.compare!.after);
  const movement = before && after ? shift(before.topline, after.topline) : null;

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={poll.status} />
        <p className="text-sm text-muted-foreground">{provenanceLine(poll)}</p>
        <PollVisibility poll={poll} onChanged={onChanged} />
      </div>

      <Provenance poll={poll} />

      {poll.methodology ? <p className="text-sm text-muted-foreground">{poll.methodology}</p> : null}

      {movement && compareTheme?.compare ? (
        <SectionCard
          title="The movement measure"
          description="What changed once respondents heard the case both ways."
          action={<CrosstabLink href={href(compareTheme.compare.after)}>Full crosstab</CrosstabLink>}
        >
          <div className="space-y-5">
            <ShiftHeadline shift={movement} />
            <PersuasionShift
              shift={movement}
              beforeLabel={compareTheme.compare.beforeLabel}
              afterLabel={compareTheme.compare.afterLabel}
              beforeHref={href(compareTheme.compare.before)}
              afterHref={href(compareTheme.compare.after)}
            />
          </div>
        </SectionCard>
      ) : null}

      <KeyFindings findings={poll.keyFindings} pollId={pollId} />

      <section aria-labelledby="questions">
        <header className="border-t-2 border-poll-accent pt-4">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-poll-accent">
            {poll.questions.length} questions
          </p>
          <h2
            id="questions"
            className="mt-2 text-3xl font-extrabold leading-[0.98] tracking-[-0.035em] text-foreground sm:text-4xl"
          >
            The instrument
          </h2>
        </header>

        <div className="mt-6 space-y-8">
          {grouped.map(({ category, blocks }) => (
            <div key={category ?? "other"}>
              <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {categoryLabel(category)}
              </h3>
              <div className="section-stack">
                {blocks.map((b) => (
                  <ThemeCard key={b.theme?.key ?? "untitled"} block={b} href={href} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        {poll.attribution ?? provenanceLine(poll)}
        {poll.licence ? ` · ${poll.licence}` : ""}
      </p>
    </div>
  );
}

/** The provenance a reader needs to trust a number, as scannable chips. */
function Provenance({ poll }: { poll: PollDetail }) {
  const window = fieldworkWindow(poll.fieldworkStart, poll.fieldworkEnd);
  const chips = [
    poll.sampleSize ? { k: "Sample", v: `n = ${poll.sampleSize.toLocaleString()}` } : null,
    window ? { k: "Fieldwork", v: window } : null,
    poll.geoScope ? { k: "Scope", v: poll.geoScope } : null,
    { k: "Weighting", v: poll.weighted ? "Weighted" : "Unweighted" },
  ].filter((c): c is { k: string; v: string } => c !== null);

  return (
    <dl className="grid gap-px overflow-hidden rounded-[4px] border border-border bg-border sm:grid-cols-4">
      {chips.map((c) => (
        <div key={c.k} className="bg-surface px-4 py-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{c.k}</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">{c.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ThemeCard({ block, href }: { block: ThemeBlock; href: (code: string) => string }) {
  // One legend per theme, read off the first battery in it — so an agree/disagree block
  // legends itself with "Strongly agree", not the support wording.
  const firstBattery = block.questions.map((q) => diverging(q.topline)).find((d) => d !== null);

  return (
    <SectionCard title={block.theme?.label ?? "Questions"} description={block.theme?.blurb}>
      <ul className="divide-y divide-border">
        {block.questions.map((q) => (
          <QuestionRow key={q.code} question={q} href={href} />
        ))}
      </ul>
      {firstBattery ? (
        <div className="mt-4 border-t border-border pt-3">
          <DivergingLegend data={firstBattery} />
        </div>
      ) : null}
    </SectionCard>
  );
}

function QuestionRow({ question, href }: { question: PollQuestionRef; href: (code: string) => string }) {
  const kind = chartKind(question.topline);
  const bars = kind === "diverging" ? diverging(question.topline) : null;
  const nominal = kind === "nominal" ? topResponses(question.topline, 3) : [];

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 rounded-[3px] bg-surface-variant px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
          {question.code}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Link
              href={href(question.code)}
              className="group min-w-0 flex-1 text-sm text-foreground hover:text-poll-accent"
            >
              {question.title}
              <ChevronRight className="ml-0.5 inline h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Sibling blocks of one question — "ranked first" vs "ranked top 3" — rather
              than two rows that look like two different questions. */}
          {question.variants.length > 1 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {question.variants.map((v) => (
                <Link
                  key={v.code}
                  href={href(v.code)}
                  className="rounded-[3px] border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-poll-accent hover:text-poll-accent"
                >
                  {v.rank ?? v.code}
                </Link>
              ))}
            </div>
          ) : null}

          {bars ? (
            <div className="mt-2.5 space-y-1">
              <DivergingNets data={bars} />
              <DivergingBar data={bars} />
            </div>
          ) : null}

          {nominal.length > 0 ? <div className="mt-2.5">
            <NominalBars rows={nominal} />
          </div> : null}
        </div>
      </div>
    </li>
  );
}
