/**
 * Prompt resolution — the port of the source's `audio_filename_hierarchy`
 * (autodialer/utils/index.ts:64), re-keyed from filenames to tenant StoredFile
 * ids.
 *
 * A prompt is `{ name?, audio? }` where `audio` is one StoredFile id or a
 * per-language map of them. Resolution order: exact language → "en" → the
 * first entry — and when nothing resolves to a playable URL the caller falls
 * back to `<Say>` of `name`, which is also the v1 default (campaigns work with
 * zero uploads).
 */

export type DialerPrompt = {
  /** The spoken text — the <Say> fallback, and the label admins see. */
  name?: string | null;
  /** StoredFile id, or { [language]: StoredFile id }. */
  audio?: string | Record<string, string> | null;
};

/** Parse the loosely-typed Json column into a DialerPrompt (null on junk). */
export function parsePrompt(value: unknown): DialerPrompt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : null;
  const audio =
    typeof record.audio === "string"
      ? record.audio
      : record.audio && typeof record.audio === "object" && !Array.isArray(record.audio)
        ? (record.audio as Record<string, string>)
        : null;
  if (!name && !audio) return null;
  return { name, audio };
}

/** The StoredFile id the prompt resolves to for `language`, or null ⇒ <Say>. */
export function resolveAudioFileId(prompt: DialerPrompt | null, language: string): string | null {
  if (!prompt?.audio) return null;
  if (typeof prompt.audio === "string") return prompt.audio || null;
  const byLanguage = prompt.audio;
  const exact = byLanguage[language];
  if (typeof exact === "string" && exact) return exact;
  const english = byLanguage.en;
  if (typeof english === "string" && english) return english;
  const first = Object.values(byLanguage).find((v) => typeof v === "string" && v);
  return (first as string | undefined) ?? null;
}

/**
 * Resolve a prompt to a playable URL via a fileId → URL map (the caller loads
 * the campaign's StoredFile rows once), or null ⇒ speak `prompt.name`.
 */
export function resolveAudioUrl(
  prompt: DialerPrompt | null,
  language: string,
  urlsByFileId: ReadonlyMap<string, string>,
): string | null {
  const fileId = resolveAudioFileId(prompt, language);
  if (!fileId) return null;
  return urlsByFileId.get(fileId) ?? null;
}
