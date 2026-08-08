/**
 * Presentation for the blast's Recipient Activity Log.
 *
 * Two defects lived in this surface, and both came from a row-level control that was not row-level:
 *
 * A "Retry" button sat in the row of each FAILED recipient and called `retryBlast(blastId)` — the
 * BLAST-wide retry. One click re-sent to every failed recipient of the blast (up to the batch cap),
 * which is real money at the provider and real messages to real people, including ones whose
 * failure was permanent. Nothing on screen said more than one person had been contacted, the
 * ApiResult was discarded so a 403 showed nothing at all, and the recipient whose row was clicked
 * often stayed FAILED — the retry batch takes the oldest failures while the table sorts by most
 * recently updated — so the button read as broken and got clicked again.
 *
 * And every recipient not yet processed fell through to "Message Sent", so a blast still in flight
 * reported people as contacted before anything had been sent to them.
 */

/**
 * How many recipients of this blast have FAILED, from the status roll-up
 * (`groupBy: { by: ["status"], _count: true }`).
 *
 * The blast-level retry names this number, so the operator sees the scope of the action before
 * pressing it rather than discovering it afterwards.
 */
export function getFailedRecipientCount(
  distribution: Array<Record<string, unknown>> | null | undefined,
): number {
  return (distribution ?? []).reduce((total, row) => {
    if (String(row?.status) !== "FAILED") return total;
    const count = Number((row as { _count?: unknown })._count ?? 0);
    return total + (Number.isFinite(count) ? count : 0);
  }, 0);
}

/**
 * The last thing that happened to one recipient.
 *
 * PENDING and QUEUED are named explicitly. Letting them fall through to "Message Sent" told
 * organisers a live blast had already reached people it had not yet touched, which overstates
 * progress on exactly the screen they watch to judge it.
 */
export function getLastActionLabel(row: Record<string, unknown> | null | undefined): string {
  const status = String(row?.status || "");
  const category = row?.failureCategory ? String(row.failureCategory) : "";
  if (status === "FAILED") return category || "Failed";
  if (status === "SKIPPED") return "Skipped";
  if (status === "PENDING" || status === "QUEUED") return "Not sent yet";
  return category || "Message Sent";
}
