import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPoll, provenanceLine } from "@/lib/insights";
import { InsightsEmbed } from "@/components/insights-embed";

export async function generateMetadata({ params }: { params: { pollId: string } }): Promise<Metadata> {
  const poll = await getPublicPoll(params.pollId);
  return { title: poll?.title ?? "Poll", description: poll ? provenanceLine(poll) : undefined };
}

/**
 * Public poll viewer — a centred, padded iframe of the admin app's chrome-less insights page
 * (`/embed/insights/<id>`, the SAME <PollBody> the signed-in `/insights/<id>` renders, minus the
 * organiser chrome and org-only targeting). One implementation, no duplication: the action app
 * owns only the framing around it. The raw `/insights/<id>` route is auth-gated and can't be
 * framed publicly, so we frame its public embed twin.
 */
export default async function PublicPollPage({ params }: { params: { pollId: string } }) {
  const poll = await getPublicPoll(params.pollId);
  if (!poll) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <InsightsEmbed
        path={`/embed/insights/${params.pollId}?theme=light`}
        title={`${poll.title} — charts, findings and regional map`}
      />
    </main>
  );
}
