import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPoll, provenanceLine } from "@/lib/insights";
import { InsightsEmbed } from "@/components/insights-embed";

export async function generateMetadata({ params }: { params: { pollId: string } }): Promise<Metadata> {
  const poll = await getPublicPoll(params.pollId);
  return { title: poll?.title ?? "Poll", description: poll ? provenanceLine(poll) : undefined };
}

/** First letters of the first two words — "Common Threads" → "CT". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Public poll viewer — the owning tenant's identity on top (initials avatar + name, emulating the
 * admin tenant switcher; Tenant has no logo field, so the mark is generated initials), then a
 * centred, padded iframe of the admin app's chrome-less insights page (`/embed/insights/<id>`, the
 * SAME <PollBody> the signed-in `/insights/<id>` renders, minus the organiser chrome and org-only
 * targeting). One implementation, no duplication. The raw `/insights/<id>` route is auth-gated and
 * can't be framed publicly, so we frame its public embed twin.
 */
export default async function PublicPollPage({ params }: { params: { pollId: string } }) {
  const poll = await getPublicPoll(params.pollId);
  if (!poll) notFound();

  const name = poll.tenant?.name ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl px-1 py-8 sm:px-3 sm:py-12">
      {name ? (
        <header className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight text-foreground">{name}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Public poll</p>
          </div>
        </header>
      ) : null}
      <InsightsEmbed
        path={`/embed/insights/${params.pollId}?theme=light`}
        title={`${poll.title} — charts, findings and regional map`}
      />
    </main>
  );
}
