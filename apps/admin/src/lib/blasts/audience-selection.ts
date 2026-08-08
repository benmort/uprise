/**
 * Should the composer replace the currently-selected audience?
 *
 * WhatsApp blasts may only target WhatsApp-capable audiences, so the composer narrows the list and
 * falls back when the selection is not in it. The subtlety is that "the list is empty" has two
 * completely different meanings — not loaded yet, and no valid audiences — and treating the first
 * as the second silently re-pointed a saved blast at a different audience:
 *
 *   1. Open a saved WhatsApp blast. The blast resolves first and sets channel=WHATSAPP plus its
 *      own audienceId.
 *   2. `isWhatsapp` flips, the narrowing effect re-runs — but `audiences` is still `[]`, so the
 *      selection "isn't in the list" and gets wiped.
 *   3. The audience list lands and `setAudienceId(prev => prev || first)` reads that blank,
 *      selecting whatever audience happens to be first.
 *   4. Autosave persists it. The organiser never touched the field.
 *
 * Hence `loaded`: nothing is replaced until the list has actually arrived.
 */
export function shouldReplaceAudience(input: {
  isWhatsapp: boolean;
  /** The currently-selected audience id ("" when none). */
  selectedId: string;
  /** Ids valid for this channel. */
  validIds: string[];
  /** Has the audience list finished loading? */
  loaded: boolean;
}): boolean {
  const { isWhatsapp, selectedId, validIds, loaded } = input;
  // SMS accepts every audience — nothing to narrow.
  if (!isWhatsapp) return false;
  // Nothing selected: the "pick a default" path owns this, not the fallback.
  if (!selectedId) return false;
  // An unloaded list is not evidence that the selection is invalid.
  if (!loaded) return false;
  return !validIds.includes(selectedId);
}

/** What to select when a replacement IS warranted — the first valid audience, else nothing. */
export function replacementAudienceId(validIds: string[]): string {
  return validIds[0] ?? "";
}
