/**
 * Which conversation the text session is showing.
 *
 * The initial-send queue comes first: while there is a recipient left to send to, the reply half
 * is not on screen at all. Once sends are exhausted, the volunteer works owned conversations —
 * the one they tapped, or the first in the list if they have not tapped one yet.
 *
 * That auto-selection is the subtle part, and it caused a real defect. The screen resolved the
 * DISPLAYED phone with this fallback, but hydrated the contact id — the thing dispositions and
 * survey answers are recorded against — only from the tap handler. So the conversation shown on
 * arrival had no contact id behind it: the volunteer could read it and reply to it, and every
 * attempt to log an outcome silently had nothing to attach to. The most common conversation in
 * the queue, the first one, was the one that could never be logged.
 *
 * Extracting it makes the pairing explicit: whatever this returns is what must be hydrated.
 */
export function resolveActiveConversationPhone(input: {
  /** The current initial-send recipient, if any — it owns the screen while it exists. */
  hasPendingSend: boolean;
  /** The conversation the volunteer tapped, if any. */
  tappedPhone: string | null;
  /** Owned conversations, in queue order. */
  conversations: Array<{ contactPhone?: string | null }>;
}): string | null {
  const { hasPendingSend, tappedPhone, conversations } = input;
  // Initial sends outrank replies — the reply pane is not rendered yet.
  if (hasPendingSend) return null;
  if (tappedPhone) return tappedPhone;
  return conversations[0]?.contactPhone ?? null;
}
