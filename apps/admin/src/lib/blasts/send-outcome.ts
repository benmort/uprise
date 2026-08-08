/**
 * Describe what `POST /blasts/:id/send` actually did.
 *
 * The endpoint answers with TWO shapes and the composer only understood one:
 *
 *   inline (FEATURE_BULLMQ_BLAST_ENABLED off) – { blast, sent, failed, remaining, … }
 *   queued (the flag ON, which is how production runs) – { queued, jobId, blast }, with NO `sent`
 *   key at all, and a `blast` read before the worker runs, so its status is still PROOFED.
 *
 * Reading `data.sent || 0` off the queued shape reported a perfectly good send as
 * "Blast sent – 0 recipients queued", with the status chip still on PROOFED. The rational
 * response to being told nothing went out is to press Send again, and each press is real money
 * and a duplicate wave to real people. So branch on the shape rather than assuming a count.
 */
export type BlastSendOutcome = {
  /** Status to show while the detail page catches up with the truth. */
  status: string;
  title: string;
  message: string;
  /** True when the worker owns the dispatch and no count exists yet. */
  queued: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function describeBlastSendOutcome(data: unknown): BlastSendOutcome {
  const body = asRecord(data);
  const blastStatus = String(asRecord(body.blast).status || "");
  const sent = typeof body.sent === "number" ? body.sent : null;

  if (sent === null) {
    /**
     * The queued shape. There is no count to report — claiming one is what caused the bug — so
     * say what is true: it is on its way. SENDING, not the PROOFED row we were just handed,
     * because that row was read before the worker touched it; the detail page refetches shortly.
     *
     * `queued: false` means the job was already in flight (stable jobId collapsed the duplicate),
     * which is worth saying plainly rather than reporting a second successful send.
     */
    const alreadyRunning = body.queued === false;
    return {
      status: "SENDING",
      queued: true,
      title: alreadyRunning ? "Already sending" : "Blast queued",
      message: alreadyRunning
        ? "This blast is already being sent — we haven't started a second run."
        : "Your blast is on its way. Delivery updates appear on the blast page.",
    };
  }

  // The inline shape, which does carry counts. Report failures too: the old copy mentioned only
  // the successes, so a send where half the recipients failed read as an unqualified success.
  const failed = typeof body.failed === "number" ? body.failed : 0;
  const remaining = typeof body.remaining === "number" ? body.remaining : 0;
  const parts = [`${sent.toLocaleString()} sent`];
  if (failed > 0) parts.push(`${failed.toLocaleString()} failed`);
  if (remaining > 0) parts.push(`${remaining.toLocaleString()} still to go`);

  return {
    status: blastStatus || "SENT",
    queued: false,
    title: failed > 0 ? "Blast sent, with failures" : "Blast sent",
    message: `${parts.join(", ")}.`,
  };
}
