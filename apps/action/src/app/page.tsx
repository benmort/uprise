import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@uprise/ui";

/** `tenant` rides through for downstream workspace scoping; the index doesn't read it yet. */
type SearchParams = { campaign?: string; tenant?: string; joined?: string };

/**
 * Public open-join preview — the same endpoint the auth app's /volunteer/[campaignId]
 * landing reads. Fetched server-side, so no cookie and no CORS. A closed campaign (or any
 * failure) yields null and the welcome falls back to generic copy rather than erroring.
 */
async function fetchCampaignName(campaignId: string): Promise<string | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  try {
    const res = await fetch(`${apiUrl}/iam/open-join/${encodeURIComponent(campaignId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const data = json && typeof json === "object" && "data" in json ? json.data : json;
    const name = (data as { campaignName?: string } | null)?.campaignName;
    return typeof name === "string" && name ? name : null;
  } catch {
    return null;
  }
}

/** Bare index — joining is per-workspace via /join/[slug]. A volunteer arriving straight
 *  from the /volunteer/[campaignId] onboarding carries `joined=1` and gets a welcome. */
export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  if (searchParams.joined !== "1") {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <h1 className="text-xl font-semibold">Uprise</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            To request access, open the join link your organisation shared with you.
          </p>
        </CardContent>
      </Card>
    );
  }

  const campaignName = searchParams.campaign ? await fetchCampaignName(searchParams.campaign) : null;
  // A campaign name may end in its own punctuation ("Climate Action!"), so only add the stop.
  const joined = campaignName
    ? `You've joined ${campaignName}${/[.!?]$/.test(campaignName) ? "" : "."}`
    : "You've joined the campaign.";

  return (
    <Card>
      <CardContent className="py-8 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--success-container))] text-[hsl(var(--success))]">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold text-foreground">You&apos;re on the team</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {joined} Your organiser will be in touch with your first shift.
        </p>
      </CardContent>
    </Card>
  );
}
