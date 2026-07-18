"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  fieldworkWindow,
  provenanceLine,
  type PollDetail,
  type PollQuestionRef,
  type PollTheme,
} from "@/lib/api/insights";
import { chartKind, diverging, shift, topResponses } from "@/lib/insights/topline";
import { StatusBadge } from "@/components/ui/status-badge";
import { KeyFindings } from "@/components/insights/key-findings";
import { PollVisibility } from "@/components/insights/poll-visibility";
import { CopyLinkButton } from "@/components/insights/copy-link-button";
import { CrosstabLink, PersuasionShift, ShiftHeadline } from "@/components/insights/persuasion-shift";
import { DivergingBar, DivergingLegend, DivergingNets, NominalBars } from "@/components/insights/diverging-bar";
import { SectionCard } from "@uprise/field";

/**
 * The whole poll overview — provenance, the movement measure, evidence-backed key findings, and
 * the instrument. Shared verbatim between the authed admin page and the chrome-less PUBLIC poll
 * route (which wraps it in <InsightsApiProvider mode="public">, so the sub-fetches hit the public
 * API). `mode="public"` hides the org-only controls (visibility toggle, copy-link).
 */
const CATEGORY_LABEL: Record<string, string> = { treaty: "Treaty", polling_background: "Political context" };
const categoryLabel = (c: string | null) =>
  c === null ? "Other questions" : (CATEGORY_LABEL[c] ?? c.replace(/_/g, " "));

type ThemeBlock = { theme: PollTheme | null; category: string | null; questions: PollQuestionRef[] };

function blocksOf(poll: PollDetail): Array<{ category: string | null; blocks: ThemeBlock[] }> {
  const byTheme = new Map<string, PollQuestionRef[]>();
  const untitled = new Map<string | null, PollQuestionRef[]>();
  for (const q of poll.questions) {
    if (q.theme) byTheme.set(q.theme, [...(byTheme.get(q.theme) ?? []), q]);
    else untitled.set(q.category, [...(untitled.get(q.category) ?? []), q]);
  }
  const blocks: ThemeBlock[] = poll.themes
    .filter((t) => byTheme.has(t.key))
    .map((t) => ({ theme: t, category: t.category, questions: byTheme.get(t.key)! }));
  for (const [category, questions] of untitled) blocks.push({ theme: null, category, questions });
  const order: Array<string | null> = [];
  for (const b of blocks) if (!order.includes(b.category)) order.push(b.category);
  return order.map((category) => ({ category, blocks: blocks.filter((b) => b.category === category) }));
}

export function PollBody({
  poll,
  pollId,
  onChanged,
  mode = "authed",
}: {
  poll: PollDetail;
  pollId: string;
  onChanged?: () => void;
  mode?: "authed" | "public";
}) {
  const isPublic = mode === "public";
  const grouped = blocksOf(poll);
  // Question links are relative to the CURRENT poll page, so they resolve correctly in every
  // context: authed /insights/[id], public /p/[id], and the iframed /embed/insights/[id]. A
  // hardcoded /insights/… path would bounce to the auth wall inside the public embed.
  const pathname = usePathname();
  const href = (code: string) => `${pathname}/questions/${code}`;

  const compareTheme = poll.themes.find((t) => t.compare);
  const before = compareTheme && poll.questions.find((q) => q.code === compareTheme.compare!.before);
  const after = compareTheme && poll.questions.find((q) => q.code === compareTheme.compare!.after);
  const movement = before && after ? shift(before.topline, after.topline) : null;

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={poll.status} />
        <p className="text-sm text-muted-foreground">{provenanceLine(poll)}</p>
        {!isPublic ? (
          <>
            <PollVisibility poll={poll} onChanged={onChanged ?? (() => {})} />
            <CopyLinkButton
              path={`/insights/${pollId}`}
              url={
                poll.isPublic && process.env.NEXT_PUBLIC_ACTION_URL
                  ? `${process.env.NEXT_PUBLIC_ACTION_URL}/insights/${pollId}`
                  : undefined
              }
              label={poll.isPublic ? "Copy public link" : "Copy share link"}
              qr
            />
          </>
        ) : null}
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

      {/* The questions carry their toplines, so most exhibits draw without a fetch. */}
      <KeyFindings findings={poll.keyFindings} pollId={pollId} questions={poll.questions} />

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

/** Longest common prefix of a list of strings. */
function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  return strings.reduce((p, s) => {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i += 1;
    return p.slice(0, i);
  });
}

/**
 * Readable row labels for a themed block. Drops the redundant code prefix (it's already shown
 * as a badge) and, for a battery whose members share a long stem — e.g. the twelve "Which party
 * is best at handling each of these issues? …" questions — drops that stem too, so each row reads
 * as its distinguishing issue ("Managing the economy…") instead of the repeated question that
 * pushed the issue off the end of the line.
 */
function shortLabels(questions: PollQuestionRef[]): Map<string, string> {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies = questions.map((q) =>
    q.title
      .replace(new RegExp(`^\\s*${esc(q.code)}[.:]?\\s*`, "i"), "") // redundant code prefix
      .replace(/\s+by BANNER\b.*$/i, "") // the crossbreak-banner annotation from the export
      .trim(),
  );
  let stem = "";
  if (bodies.length > 1) {
    stem = commonPrefix(bodies);
    stem = stem.slice(0, stem.lastIndexOf(" ") + 1); // keep to a word boundary
    if (stem.trim().length < 12) stem = ""; // ignore coincidental short overlaps
  }
  return new Map(
    questions.map((q, i) => {
      const body = bodies[i];
      const rest = stem && body.startsWith(stem) ? body.slice(stem.length).trim() : body;
      return [q.code, rest || body || q.title];
    }),
  );
}

function ThemeCard({ block, href }: { block: ThemeBlock; href: (code: string) => string }) {
  const firstBattery = block.questions.map((q) => diverging(q.topline)).find((d) => d !== null);
  const labels = shortLabels(block.questions);
  return (
    <SectionCard title={block.theme?.label ?? "Questions"} description={block.theme?.blurb}>
      <ul className="divide-y divide-border">
        {block.questions.map((q) => (
          <QuestionRow key={q.code} question={q} label={labels.get(q.code) ?? q.title} href={href} />
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

function QuestionRow({
  question,
  label,
  href,
}: {
  question: PollQuestionRef;
  label: string;
  href: (code: string) => string;
}) {
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
              {label}
              <ChevronRight className="ml-0.5 inline h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
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
          {nominal.length > 0 ? (
            <div className="mt-2.5">
              <NominalBars rows={nominal} />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
