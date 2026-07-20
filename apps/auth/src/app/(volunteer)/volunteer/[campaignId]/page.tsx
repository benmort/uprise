import { auth } from "@uprise/api-client";
import type { OpenJoinPreview } from "@uprise/contracts";
import { OpenJoinClient } from "./open-join-client";

/**
 * Tokenless open-join entry — a per-campaign public link (`/volunteer/[campaignId]`).
 * SERVER component: it resolves the campaign preview (server-gated by its `openJoinEnabled`
 * flag) here, so the first byte of HTML is already in the tenant's brand colours — no flash of
 * Uprise's default blue snapping to the org's on load. The client half (OpenJoinClient) seeds
 * its state from `initialPreview` and only runs the session/membership check on the client.
 */
export default async function OpenJoinPage({
  params,
  searchParams,
}: {
  params: { campaignId: string };
  searchParams: { return_to?: string };
}) {
  const campaignId = String(params.campaignId ?? "");
  const returnTo = searchParams.return_to || null;

  // Public GET — resolve the campaign (incl. brand) up-front so the branded loading panel paints
  // on first byte. Any failure falls back to an inline error in the client, never a blank page.
  let initialPreview: OpenJoinPreview | null = null;
  let initialError: string | null = null;
  try {
    const res = await auth.openJoinPreview(campaignId);
    if (res.ok) initialPreview = res.data;
    else initialError = res.error;
  } catch {
    initialError = "Couldn't load this campaign.";
  }

  return (
    <OpenJoinClient
      campaignId={campaignId}
      initialPreview={initialPreview}
      initialError={initialError}
      returnTo={returnTo}
    />
  );
}
