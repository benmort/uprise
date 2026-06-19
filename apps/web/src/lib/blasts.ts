import { createBlast, listAudiences, type MessageChannel } from "@/lib/api";

export const DEFAULT_BLAST_TEMPLATE =
  "Hi {{first_name}}! We're building our volunteer team in {{city}} and would love your help at an upcoming community action. Can we count you in? Reply YES to volunteer or STOP to opt out.";

type Nav = { push: (href: string) => void };
type Toast = (input: {
  tone: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
}) => void;

/**
 * Create a draft blast (defaulting to the latest audience + the given channel) and open it in
 * the composer. Shared by the header "Create Blast" button and the per-channel "New blast" CTAs.
 * The composer adopts the blast's channel on load, so the channel sticks with no composer change.
 */
export async function createBlastAndOpen(
  router: Nav,
  showToast: Toast,
  opts?: { channel?: MessageChannel },
): Promise<string | null> {
  let latestAudienceId: string | undefined;
  const audienceResult = await listAudiences({ limit: 1, offset: 0 });
  if (audienceResult.ok) {
    const latest = audienceResult.data.rows?.[0] as Record<string, unknown> | undefined;
    if (latest && typeof latest.id === "string") latestAudienceId = latest.id;
  }

  const created = await createBlast({
    title: "New Blast",
    bodyTemplate: DEFAULT_BLAST_TEMPLATE,
    audienceId: latestAudienceId,
    ...(opts?.channel ? { channel: opts.channel } : {}),
  });
  if (!created.ok) {
    showToast({ tone: "error", title: "Could not create blast", description: created.error });
    return null;
  }
  const id = String((created.data as { id: unknown }).id);
  showToast({ tone: "success", title: "Blast draft created", description: "Opening the composer now." });
  router.push(`/blasts/${encodeURIComponent(id)}/composer`);
  return id;
}
