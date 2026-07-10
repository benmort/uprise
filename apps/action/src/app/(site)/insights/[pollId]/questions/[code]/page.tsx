import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPollQuestion } from "@/lib/insights";
import { InsightsEmbed } from "@/components/insights-embed";

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

      {/* The full crosstab viz (charts + choropleth + heat table) — the SAME components the
          signed-in view uses, embedded from the admin app so there's one implementation. */}
      <InsightsEmbed
        path={`/embed/insights/${params.pollId}/questions/${params.code}?theme=light`}
        title={`${data.question.title} — charts and regional map`}
      />
    </article>
  );
}
