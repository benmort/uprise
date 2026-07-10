import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getPublicPoll,
  provenanceLine,
  fieldworkWindow,
  type PublicPoll,
  type PublicQuestionRef,
} from "@/lib/insights";

const CATEGORY_LABEL: Record<string, string> = { treaty: "Treaty", polling_background: "Political context" };
const categoryLabel = (c: string | null) =>
  c === null ? "Other questions" : (CATEGORY_LABEL[c] ?? c.replace(/_/g, " "));

export async function generateMetadata({ params }: { params: { pollId: string } }): Promise<Metadata> {
  const poll = await getPublicPoll(params.pollId);
  return { title: poll?.title ?? "Poll", description: poll ? provenanceLine(poll) : undefined };
}

export default async function PublicPollPage({ params }: { params: { pollId: string } }) {
  const poll = await getPublicPoll(params.pollId);
  if (!poll) notFound();
  const byCategory = groupByCategory(poll.questions);

  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
          {poll.geoScope ? `${poll.geoScope} · ` : ""}Public poll
        </p>
        <h1 className="text-3xl font-extrabold leading-[1.02] tracking-tight sm:text-4xl">{poll.title}</h1>
        <p className="text-sm text-muted-foreground">{provenanceLine(poll)}</p>
      </header>

      <ProvenanceChips poll={poll} />

      {poll.keyFindings.length ? (
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold">Key findings</h2>
          <ol className="grid gap-4 sm:grid-cols-2">
            {poll.keyFindings.map((f, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface p-5">
                <h3 className="text-base font-bold">{f.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {poll.questions.length ? (
        <section className="space-y-5">
          <h2 className="text-lg font-extrabold">The questions</h2>
          {byCategory.map(([category, questions]) => (
            <div key={category ?? "other"} className="space-y-2">
              <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {categoryLabel(category)}
              </h3>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {questions.map((q) => (
                  <li key={q.code}>
                    <Link
                      href={`/insights/${poll.id}/questions/${q.code}`}
                      className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-variant"
                    >
                      <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {q.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{q.title}</span>
                      <span aria-hidden className="text-muted-foreground">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {poll.attribution ? (
        <p className="text-xs text-muted-foreground">
          {poll.attribution}
          {poll.licence ? ` · ${poll.licence}` : ""}
        </p>
      ) : null}
    </article>
  );
}

function groupByCategory(questions: PublicQuestionRef[]): Array<[string | null, PublicQuestionRef[]]> {
  const map = new Map<string | null, PublicQuestionRef[]>();
  for (const q of questions) map.set(q.category, [...(map.get(q.category) ?? []), q]);
  return [...map.entries()];
}

function ProvenanceChips({ poll }: { poll: PublicPoll }) {
  const win = fieldworkWindow(poll.fieldworkStart, poll.fieldworkEnd);
  const chips = [
    poll.sampleSize ? { k: "Sample", v: `n = ${poll.sampleSize.toLocaleString()}` } : null,
    win ? { k: "Fieldwork", v: win } : null,
    poll.geoScope ? { k: "Scope", v: poll.geoScope } : null,
    { k: "Weighting", v: poll.weighted ? "Weighted" : "Unweighted" },
  ].filter((c): c is { k: string; v: string } => c !== null);
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {chips.map((c) => (
        <div key={c.k} className="bg-surface px-4 py-3">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.k}</dt>
          <dd className="mt-0.5 text-sm font-semibold">{c.v}</dd>
        </div>
      ))}
    </dl>
  );
}
