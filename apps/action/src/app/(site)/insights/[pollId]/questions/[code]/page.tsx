import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPollQuestion } from "@/lib/insights";

const pct = (v: number | null | undefined) => (typeof v === "number" ? `${Math.round(v)}%` : "—");
const barWidth = (v: number | null | undefined) => `${Math.max(0, Math.min(100, typeof v === "number" ? v : 0))}%`;

export async function generateMetadata({
  params,
}: {
  params: { pollId: string; code: string };
}): Promise<Metadata> {
  const q = await getPublicPollQuestion(params.pollId, params.code);
  return { title: q ? q.question.title : "Question" };
}

export default async function PublicQuestionPage({
  params,
}: {
  params: { pollId: string; code: string };
}) {
  const data = await getPublicPollQuestion(params.pollId, params.code);
  if (!data) notFound();

  const totalCol = data.groups.find((g) => g.group === "Total")?.columns[0];
  const geoGroup = data.groups.find((g) => g.columns.some((c) => c.geoKind));
  // Headline response for the regional breakdown: the first NET row, else the first response.
  const headline = data.responses.find((r) => r.isNet) ?? data.responses[0];

  return (
    <article className="space-y-8">
      <div>
        <Link
          href={`/insights/${params.pollId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {data.poll.title}
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {data.question.title}
        </h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {data.question.code}
          {data.poll.attribution ? ` · ${data.poll.attribution}` : ""}
        </p>
      </div>

      {/* Whole-sample response breakdown */}
      {totalCol ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            All respondents
            {typeof totalCol.baseN === "number" ? ` · n=${totalCol.baseN.toLocaleString()}` : ""}
          </h2>
          <ul className="space-y-2.5">
            {data.responses.map((r) => {
              const v = r.cells[totalCol.ordinal];
              return (
                <li key={r.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={r.isNet ? "font-bold" : ""}>{r.label}</span>
                    <span className="font-semibold tabular-nums">{pct(v)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-variant">
                    <div className="h-full rounded-full bg-primary" style={{ width: barWidth(v) }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Regional breakdown (lightweight bars — the map lives in the signed-in view) */}
      {geoGroup && headline ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {geoGroup.group} — {headline.label}
          </h2>
          <ul className="space-y-2.5">
            {[...geoGroup.columns]
              .sort((a, b) => (headline.cells[b.ordinal] ?? -1) - (headline.cells[a.ordinal] ?? -1))
              .map((col) => {
                const v = col.reportable ? headline.cells[col.ordinal] : null;
                return (
                  <li key={col.ordinal}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{col.value}</span>
                      <span className="font-semibold tabular-nums">{col.reportable ? pct(v) : "—"}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-variant">
                      <div className="h-full rounded-full bg-primary/80" style={{ width: barWidth(v) }} />
                    </div>
                  </li>
                );
              })}
          </ul>
          <p className="text-xs text-muted-foreground">Regions with a small base are not reported.</p>
        </section>
      ) : null}
    </article>
  );
}
