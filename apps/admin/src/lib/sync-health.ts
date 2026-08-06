/**
 * Reading an integration sync's stats honestly. The pull pipeline reports what it
 * imported AND what it couldn't text (email-only people kept as non-contactable) and
 * what it skipped — these helpers turn that into the one line an organiser reads, and
 * label each machine reason. Tolerant of both stats generations: rows synced before
 * the email-only fix carry the same reason keys with different implications, so the
 * labelling never assumes a field exists.
 */

export type SyncRunStats = {
  processedItems?: number;
  returnedContacts?: number;
  skippedNoPhone?: number;
  skippedInvalidPhone?: number;
  failedPersist?: number;
  reasonCounts?: Record<string, number>;
};

const REASON_LABELS: Record<string, string> = {
  missing_phone_number: "No mobile number – kept as email-only",
  invalid_phone_format: "Phone number couldn't be read",
  database_constraint_error: "Duplicate row conflict",
  persistence_error: "Couldn't be saved",
  tag_apply_failed: "Tags couldn't be copied",
  consent_mirror_failed: "Opt-out flag couldn't be copied",
};

/** Human label for a skip/failure reason key; unknown keys humanise rather than leak. */
export function labelSkipReason(key: string): string {
  if (REASON_LABELS[key]) return REASON_LABELS[key];
  const cleaned = String(key ?? "").replace(/[_-]+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Other";
}

/** `[ [label, count], … ]` rows for the reason breakdown, largest first, zero-free. */
export function reasonRowsFromStats(stats: SyncRunStats | null | undefined): Array<[string, number]> {
  const counts = stats?.reasonCounts ?? {};
  return Object.entries(counts)
    .filter(([, n]) => Number(n) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .map(([key, n]) => [labelSkipReason(key), Number(n)]);
}

/**
 * "1,204 imported · 214 email-only (kept, not textable) · 28 skipped" — the honest
 * one-liner. `syncedCount` is the audience rows written; email-only rows are inside it
 * (they were imported), so textable = synced − email-only. Pre-fix runs (email-only
 * people dropped, so never in syncedCount) still read correctly: their email-only
 * count simply reports as skipped.
 */
export function importSummaryLine(syncedCount: number, stats: SyncRunStats | null | undefined): string {
  const synced = Math.max(0, Number(syncedCount) || 0);
  const emailOnly = Math.max(0, Number(stats?.skippedNoPhone) || 0);
  const invalid = Math.max(0, Number(stats?.skippedInvalidPhone) || 0);
  const failed = Math.max(0, Number(stats?.failedPersist) || 0);
  const parts = [`${synced.toLocaleString()} imported`];
  // Email-only rows are part of synced only when the kept-rows pipeline produced them.
  const keptEmailOnly = Math.min(emailOnly, synced);
  if (keptEmailOnly > 0) parts.push(`${keptEmailOnly.toLocaleString()} email-only (kept, not textable)`);
  const skipped = invalid + failed + Math.max(0, emailOnly - keptEmailOnly);
  if (skipped > 0) parts.push(`${skipped.toLocaleString()} skipped`);
  return parts.join(" · ");
}
