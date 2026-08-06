/**
 * The guided NationBuilder connect flow's pure half. The dialog asks a non-technical
 * organiser for two things — their nation's address and an API token — and these helpers
 * absorb every reasonable way of answering ("castle-hill", "castle-hill.nationbuilder.com",
 * a full control-panel URL pasted wholesale) into the slug the connection actually stores.
 */

/** `https://<slug>.nationbuilder.com` — the derived per-nation endpoint. */
export function nationBaseUrl(slug: string): string {
  return `https://${slug}.nationbuilder.com`;
}

/**
 * Whatever the organiser pastes → the bare nation slug, or "" when nothing usable is
 * there. Tolerates protocols, the .nationbuilder.com suffix, paths/queries, whitespace
 * and case; rejects anything that still isn't a plausible slug after cleaning.
 */
export function normaliseNationSlug(raw: string): string {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z]+:\/\//, ""); // protocol
  s = s.split(/[/?#]/, 1)[0] ?? ""; // path / query / fragment
  s = s.replace(/\.nationbuilder\.com$/, "");
  s = s.replace(/^www\./, "");
  s = s.trim();
  // A slug is a bare hostname label. Anything still dotted is some other domain —
  // white-label nations need the advanced form in Settings → Integrations.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return "";
  return s;
}

export type NationConnectErrors = {
  slug?: string;
  token?: string;
};

/** Field-level validation for the connect dialog. Empty object = good to submit. */
export function validateNationConnect(input: { slug: string; token: string }): NationConnectErrors {
  const errors: NationConnectErrors = {};
  if (!normaliseNationSlug(input.slug)) {
    errors.slug = "Enter your nation's address – the <slug> in <slug>.nationbuilder.com.";
  }
  if (!String(input.token ?? "").trim()) {
    errors.token = "Paste the API token from your nation's Settings → Developer → API token.";
  }
  return errors;
}
