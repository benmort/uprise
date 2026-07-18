import { renderBrandedEmail, renderPlainEmail, type BrandedEmailContent } from "./email-layout";

const base: BrandedEmailContent = {
  brandName: "Common Threads",
  heading: "You're invited to Common Threads",
  intro: ["You've been invited to join Common Threads as a Volunteer.", "Accept the invitation to set up your account."],
  cta: { label: "Accept invitation", url: "https://auth.example/invite/abc123" },
  outro: ["This invitation expires on Friday."],
  preheader: "You've been invited to join Common Threads.",
};

describe("renderBrandedEmail", () => {
  it("renders a full HTML document with the heading, intro, brand and footer", () => {
    const html = renderBrandedEmail(base);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("You're invited to Common Threads");
    expect(html).toContain("You've been invited to join Common Threads as a Volunteer.");
    expect(html).toContain("Common Threads"); // wordmark + footer attribution
    expect(html).toContain("This invitation expires on Friday.");
  });

  it("puts the CTA url behind a button + a fallback link, with the label as the button text", () => {
    const html = renderBrandedEmail(base);
    expect(html).toContain("Accept invitation"); // the button label
    // The url appears as an href (button + fallback), never as bare unlinked text only.
    expect(html).toContain('href="https://auth.example/invite/abc123"');
    expect(html).toContain("paste this link into your browser");
  });

  it("attributes the footer to the org 'via' the platform, defaulting to Uprise", () => {
    expect(renderBrandedEmail(base)).toContain("Sent by Common Threads via Uprise.");
    expect(renderBrandedEmail({ ...base, platformName: "Field" })).toContain("Sent by Common Threads via Field.");
  });

  it("collapses the footer to just the platform when the sender IS the platform", () => {
    const html = renderBrandedEmail({ ...base, brandName: "Uprise" });
    expect(html).toContain("Sent by Uprise.");
    expect(html).not.toContain("via Uprise");
  });

  it("hides the preheader as a zero-height snippet", () => {
    const html = renderBrandedEmail(base);
    expect(html).toContain("You've been invited to join Common Threads.");
    expect(html).toMatch(/display:none;max-height:0/);
  });

  it("omits the button block entirely when there's no CTA", () => {
    const html = renderBrandedEmail({ ...base, cta: undefined });
    expect(html).not.toContain("paste this link into your browser");
    expect(html).not.toContain("href=");
  });

  it("renders the tenant logo as an img (replacing the wordmark) when an https URL is given", () => {
    const html = renderBrandedEmail({ ...base, logoUrl: "https://blob.example/logo.png" });
    expect(html).toContain('<img src="https://blob.example/logo.png"');
    expect(html).toContain('alt="Common Threads"'); // brand name is the alt text
  });

  it("falls back to the text wordmark for a missing or non-https logo (no mixed-content img)", () => {
    const noLogo = renderBrandedEmail(base);
    expect(noLogo).not.toContain("<img");
    expect(noLogo).toContain("Common Threads");
    const httpLogo = renderBrandedEmail({ ...base, logoUrl: "http://insecure.example/logo.png" });
    expect(httpLogo).not.toContain("<img"); // http rejected — clients block mixed content anyway
  });

  it("uses a valid hex accent for the button + link, and ignores an invalid/malicious one", () => {
    const themed = renderBrandedEmail({ ...base, accentColour: "#16A34A" });
    expect(themed).toContain("background:#16A34A"); // the button
    const injected = renderBrandedEmail({ ...base, accentColour: "red;} body{display:none" });
    expect(injected).not.toContain("body{display:none"); // the payload was not interpolated
    expect(injected).not.toContain("background:red"); // rejected, not used as the colour
    expect(injected).toContain("background:#2f5bd6"); // fell back to the default accent
  });

  it("fills the CTA button with the secondary (buttonColour), keeping links on the accent", () => {
    const html = renderBrandedEmail({ ...base, accentColour: "#111111", buttonColour: "#22aa22" });
    expect(html).toContain("background:#22aa22"); // button = secondary
    expect(html).toContain("color:#111111"); // the "paste this link" fallback stays on the accent
  });

  it("autolinks a bare URL in the body so the link is always clickable, not naked text", () => {
    const html = renderBrandedEmail({
      ...base,
      cta: undefined,
      accentColour: "#123456",
      intro: ["Accept your invite: https://auth.example/invite/abc123"],
    });
    expect(html).toContain('<a href="https://auth.example/invite/abc123" style="color:#123456');
  });

  it("escapes HTML in content so injected markup can't break out", () => {
    const html = renderBrandedEmail({
      ...base,
      heading: "Hi <script>alert(1)</script> & \"friends\"",
      cta: { label: "Go", url: "https://x/?a=1&b=2" },
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("https://x/?a=1&amp;b=2");
  });
});

describe("renderPlainEmail", () => {
  it("lays out heading, intro, the labelled link and the brand sign-off", () => {
    const text = renderPlainEmail(base);
    expect(text).toContain("You're invited to Common Threads");
    expect(text).toContain("Accept invitation: https://auth.example/invite/abc123");
    expect(text).toContain("This invitation expires on Friday.");
    expect(text.trimEnd().endsWith("— Common Threads")).toBe(true);
  });

  it("drops the link line when there's no CTA", () => {
    const text = renderPlainEmail({ ...base, cta: undefined, outro: undefined });
    expect(text).not.toContain("http");
    expect(text).toContain("— Common Threads");
  });
});
