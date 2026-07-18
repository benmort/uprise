/**
 * Branded HTML shell for transactional email.
 *
 * Every transactional email (invitations, magic links, verification, receipts) renders through
 * this one layout so they arrive looking like a product, not a raw link. It is deliberately
 * table-based with inline styles — the only markup email clients (Gmail, Apple Mail, Outlook)
 * render reliably — and pairs with a plain-text twin ({@link renderPlainEmail}) for the
 * multipart alternative and text-only clients.
 *
 * The design is intentionally restrained: a single centred card on a soft neutral ground, one
 * confident call-to-action button, and the sending organisation's name as the wordmark. The raw
 * (often tracking-wrapped) URL never shows — it lives behind the button and a plain fallback
 * link — which is the whole point of moving off "Accept your invitation: <ugly-url>".
 */

export type EmailCta = { label: string; url: string };

export interface BrandedEmailContent {
  /** Inbox preview snippet — hidden in the body, shown by the client next to the subject. */
  preheader?: string;
  /** The organisation the email is from — the wordmark + footer attribution. */
  brandName: string;
  /** The platform the email is delivered through — the "via …" footer attribution. Defaults
   *  to "Uprise", and collapses to just the platform when the sender IS the platform. */
  platformName?: string;
  /**
   * Absolute https URL of the sending tenant's logo. When present it replaces the text wordmark
   * in the header (email clients only load absolute, publicly reachable images).
   */
  logoUrl?: string;
  /**
   * The tenant's brand colour for the button + links, as a `#rrggbb` hex. Anything that isn't a
   * 6-digit hex is ignored and the default accent is used (inline style values aren't escaped, so
   * this MUST be validated before it reaches the markup).
   */
  accentColour?: string;
  /** Big title inside the card. */
  heading: string;
  /** Paragraphs before the button. */
  intro: string[];
  /** The primary action. Its URL sits behind the button + a fallback link, never shown raw. */
  cta?: EmailCta;
  /** Paragraphs after the button (e.g. an expiry note or "didn't expect this?"). */
  outro?: string[];
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A safe `#rrggbb` accent, or null — guards the raw interpolation into inline `style`. */
function safeHex(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

/** Footer attribution: "Sent by {org} via {platform}." — collapsed to "Sent by {platform}."
 *  when the sending org IS the platform (so platform-sent mail doesn't read "Uprise via Uprise"). */
function sentBy(brandName: string, platformName?: string): string {
  const platform = (platformName ?? "").trim() || "Uprise";
  return brandName.trim().toLowerCase() === platform.toLowerCase()
    ? `Sent by ${platform}.`
    : `Sent by ${brandName} via ${platform}.`;
}

// Considered neutral-with-ink palette (not a default blue-on-white): warm-grey ground, an ink
// close to the org identity, one strong accent for the button.
const C = {
  ground: "#eef0ec",
  card: "#ffffff",
  ink: "#16232b",
  muted: "#5b6a72",
  border: "#e2e5df",
  accent: "#2f5bd6",
  accentText: "#ffffff",
};

const para = (text: string, color: string): string =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${color};">${esc(text)}</p>`;

/** The branded, email-client-safe HTML document. */
export function renderBrandedEmail(c: BrandedEmailContent): string {
  const preheader = c.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(c.preheader)}</div>`
    : "";

  const accent = safeHex(c.accentColour) ?? C.accent;

  const intro = c.intro.map((p) => para(p, C.ink)).join("");
  const outro = (c.outro ?? []).map((p) => para(p, C.muted)).join("");

  // Tenant logo (absolute https only) replaces the text wordmark when present.
  const wordmark =
    typeof c.logoUrl === "string" && /^https:\/\//i.test(c.logoUrl)
      ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.brandName)}" style="max-height:40px;max-width:220px;display:block;border:0;" />`
      : `<span style="font-size:13px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${C.muted};">${esc(c.brandName)}</span>`;

  const button = c.cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
        <tr>
          <td style="border-radius:10px;background:${accent};">
            <a href="${esc(c.cta.url)}"
               style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:700;color:${C.accentText};text-decoration:none;border-radius:10px;">
              ${esc(c.cta.label)}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${C.muted};">
        Or paste this link into your browser:<br />
        <a href="${esc(c.cta.url)}" style="color:${accent};word-break:break-all;">${esc(c.cta.url)}</a>
      </p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${esc(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.ground};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
          <tr>
            <td style="padding:4px 8px 18px;">
              ${wordmark}
            </td>
          </tr>
          <tr>
            <td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:34px 34px 30px;">
              <h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;font-weight:800;color:${C.ink};">${esc(c.heading)}</h1>
              ${intro}
              ${button}
              ${outro}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 8px 4px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${C.muted};">
                ${esc(sentBy(c.brandName, c.platformName))} If you weren't expecting this email you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text twin — the multipart alternative and the fallback for text-only clients. */
export function renderPlainEmail(c: BrandedEmailContent): string {
  const lines: string[] = [c.heading, "", ...c.intro];
  if (c.cta) lines.push("", `${c.cta.label}: ${c.cta.url}`);
  if (c.outro?.length) lines.push("", ...c.outro);
  lines.push("", sentBy(c.brandName, c.platformName), `— ${c.brandName}`);
  return lines.join("\n");
}
