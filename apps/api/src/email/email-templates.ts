export interface EmailTemplateLayout {
  /** Inbox preview snippet. Supports {{vars}}. */
  preheader?: string;
  /** Big title in the card. Supports {{vars}}. */
  heading: string;
  /** Paragraphs before the button. Each supports {{vars}}; a paragraph that renders empty is dropped. */
  intro: string[];
  /** The primary action button. `hrefVar` names the {{var}} holding the URL. */
  cta?: { label: string; hrefVar: string };
  /** Paragraphs after the button. Each supports {{vars}}; empty ones are dropped. */
  outro?: string[];
}

export interface EmailTemplateDef {
  subject: string;
  /** Plain-text body — the multipart alternative + the shape a tenant override edits. */
  body: string;
  /**
   * Optional structured content for the branded HTML render. When present it drives the CTA-button
   * layout; when absent the sender frames the plain `body` in the same branded shell, so every
   * email still looks like a product. Tenant DB overrides (subject/body only) always take the
   * plain-framed path.
   */
  layout?: EmailTemplateLayout;
}

/**
 * Built-in transactional email templates. A tenant can override any key's subject/body with an
 * `email.EmailTemplate` row; these are the fallback so transactional email works without seeding.
 * `{{var}}` placeholders are substituted at send time. The `layout` block (built-ins only) upgrades
 * the user-facing emails from a raw link to a branded card with a real call-to-action button.
 */
export const DEFAULT_EMAIL_TEMPLATES: Record<string, EmailTemplateDef> = {
  welcome: {
    subject: "Welcome to {{appName}}",
    body: "Hi {{name}},\n\nWelcome to {{appName}}.",
    layout: {
      preheader: "You're all set up on {{appName}}.",
      heading: "Welcome to {{appName}}",
      intro: ["Hi {{name}},", "You're all set up. We're glad to have you on board."],
    },
  },
  magic_link: {
    subject: "Your sign-in link",
    body: "Sign in here: {{link}}\n\nThis link expires shortly.",
    layout: {
      preheader: "Your one-time sign-in link.",
      heading: "Sign in",
      intro: ["Use the button below to sign in. No password needed."],
      cta: { label: "Sign in", hrefVar: "link" },
      outro: ["This link expires shortly and can only be used once."],
    },
  },
  event_reminder: {
    subject: "Reminder: {{eventTitle}} is coming up",
    body: "Hi {{name}},\n\nA quick reminder that {{eventTitle}} is on {{whenText}}{{whereSuffix}}.\n\nManage your RSVP: {{manageUrl}}",
    layout: {
      preheader: "{{eventTitle}} is coming up.",
      heading: "See you at {{eventTitle}}",
      intro: ["Hi {{name}},", "Just a reminder that {{eventTitle}} is on {{whenText}}{{whereSuffix}}."],
      cta: { label: "Manage your RSVP", hrefVar: "manageUrl" },
    },
  },
  verification: {
    subject: "Verify your email",
    body: "Your verification code is {{code}}.",
    layout: {
      preheader: "Your verification code is {{code}}.",
      heading: "Verify your email",
      intro: ["Enter this code to confirm your email address:", "{{code}}"],
      outro: ["If you didn't request this, you can ignore this email."],
    },
  },
  invitation: {
    subject: "You've been invited to {{tenant}}",
    body: "You've been invited to join {{tenant}}{{roleSuffix}}.\n\nAccept your invitation: {{link}}{{expirySuffix}}",
    layout: {
      preheader: "You've been invited to join {{tenant}}.",
      heading: "You're invited to {{tenant}}",
      intro: ["You've been invited to join {{tenant}}{{roleSuffix}}.", "Accept the invitation to set up your account."],
      cta: { label: "Accept invitation", hrefVar: "link" },
      outro: ["{{expiryNote}}"],
    },
  },
  recovery: {
    subject: "Reset your password",
    body: "Reset your password: {{link}}",
    layout: {
      preheader: "Reset your password.",
      heading: "Reset your password",
      intro: ["We received a request to reset your password. Use the button below to choose a new one."],
      cta: { label: "Reset password", hrefVar: "link" },
      outro: ["If you didn't request this, you can safely ignore this email — your password won't change."],
    },
  },
  contact_form: { subject: "New contact form submission", body: "{{message}}" },
  demo_request: { subject: "New demo request", body: "{{message}}" },
  newsletter: { subject: "{{subject}}", body: "{{body}}" },
  join_request_submitted: {
    subject: "New request to join {{tenant}}",
    body: "{{email}} has requested to join {{tenant}} as {{requestedRole}}.\n\nReview it in the admin Team page.",
  },
  join_request_approved: {
    subject: "You're in — {{tenant}}",
    body: "Your request to join {{tenant}} has been approved. Sign in here: {{link}}",
    layout: {
      preheader: "Your request to join {{tenant}} was approved.",
      heading: "You're in — welcome to {{tenant}}",
      intro: ["Your request to join {{tenant}} has been approved. Sign in to get started."],
      cta: { label: "Sign in", hrefVar: "link" },
    },
  },
  join_request_rejected: {
    subject: "Your request to join {{tenant}}",
    body: "Hi,\n\nYour request to join {{tenant}} was not approved at this time.",
    layout: {
      preheader: "An update on your request to join {{tenant}}.",
      heading: "Your request to join {{tenant}}",
      intro: ["Thanks for your interest in {{tenant}}. Your request wasn't approved at this time."],
    },
  },
  receipt: {
    subject: "Your receipt from {{appName}}",
    body: "Hi,\n\nWe received your payment of {{amount}}. Thank you.",
  },
  refund: {
    subject: "Your refund from {{appName}}",
    body: "Hi,\n\nA refund of {{amount}} has been processed to your payment method.",
  },
};
