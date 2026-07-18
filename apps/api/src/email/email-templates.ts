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
    body: "Hi {{name}},\n\nYour {{appName}} account is ready to go — welcome aboard. Jump in whenever you're ready; everything you need is waiting for you.",
    layout: {
      preheader: "You're all set on {{appName}} — here's what's next.",
      heading: "Welcome to {{appName}}",
      intro: [
        "Hi {{name}},",
        "Your account is ready to go — welcome aboard. We're glad to have you.",
        "Jump in whenever you're ready; everything you need is waiting for you.",
      ],
    },
  },
  magic_link: {
    subject: "Your sign-in link",
    body: "Sign in with this link: {{link}}\n\nFor your security it works once and expires shortly. Didn't try to sign in? You can safely ignore this email.",
    layout: {
      preheader: "Tap to sign in — no password needed.",
      heading: "Sign in",
      intro: ["Tap the button below to sign in securely — there's no password to remember."],
      cta: { label: "Sign in", hrefVar: "link" },
      outro: ["For your security this link works once and expires shortly. Didn't try to sign in? You can safely ignore this email."],
    },
  },
  event_reminder: {
    subject: "Reminder: {{eventTitle}} is coming up",
    body: "Hi {{name}},\n\nJust a heads-up that {{eventTitle}} is on {{whenText}}{{whereSuffix}}. We're looking forward to seeing you there.\n\nManage your RSVP: {{manageUrl}}",
    layout: {
      preheader: "See you soon — {{eventTitle}} is almost here.",
      heading: "See you at {{eventTitle}}",
      intro: [
        "Hi {{name}},",
        "Just a heads-up that {{eventTitle}} is on {{whenText}}{{whereSuffix}}.",
        "We're looking forward to seeing you there. Need to update your details, or can't make it any more? You can manage your RSVP below.",
      ],
      cta: { label: "Manage your RSVP", hrefVar: "manageUrl" },
    },
  },
  verification: {
    subject: "Verify your email",
    body: "Your verification code is {{code}}.",
    layout: {
      preheader: "Your verification code is {{code}}.",
      heading: "Verify your email",
      intro: ["Enter this code to confirm your email address and finish setting up:", "{{code}}"],
      outro: ["This code expires shortly. If you didn't request it, you can safely ignore this email."],
    },
  },
  invitation: {
    subject: "You've been invited to {{tenant}}",
    body: "You've been invited to join {{tenant}}{{roleSuffix}} — we're glad to have you.\n\nAccept your invitation to set up your account:\n{{link}}{{expirySuffix}}",
    layout: {
      preheader: "You've been invited to join {{tenant}} — accept to get started.",
      heading: "You're invited to {{tenant}}",
      intro: [
        "You've been invited to join {{tenant}}{{roleSuffix}} — we're glad to have you.",
        "Accept your invitation below to set up your account. It only takes a minute.",
      ],
      cta: { label: "Accept invitation", hrefVar: "link" },
      outro: ["{{expiryNote}}", "Didn't expect this invitation? You can safely ignore this email."],
    },
  },
  recovery: {
    subject: "Reset your password",
    body: "Reset your password with this link: {{link}}\n\nFor your security it expires shortly. If you didn't request this, you can safely ignore this email — your password won't change.",
    layout: {
      preheader: "Choose a new password — the link's inside.",
      heading: "Reset your password",
      intro: ["We received a request to reset your password. Tap the button below to choose a new one — it only takes a moment."],
      cta: { label: "Reset password", hrefVar: "link" },
      outro: ["For your security this link expires shortly. If you didn't request this, you can safely ignore this email — your password won't change."],
    },
  },
  contact_form: { subject: "New contact form submission", body: "{{message}}" },
  demo_request: { subject: "New demo request", body: "{{message}}" },
  newsletter: { subject: "{{subject}}", body: "{{body}}" },
  join_request_submitted: {
    subject: "New request to join {{tenant}}",
    body: "{{email}} has asked to join {{tenant}} as {{requestedRole}}.\n\nReview and approve or decline it on the Team page in your admin.",
  },
  join_request_approved: {
    subject: "You're in — welcome to {{tenant}}",
    body: "Great news — your request to join {{tenant}} has been approved.\n\nSign in to get started: {{link}}",
    layout: {
      preheader: "Your request to join {{tenant}} was approved.",
      heading: "You're in — welcome to {{tenant}}",
      intro: ["Great news — your request to join {{tenant}} has been approved. Sign in below to get started."],
      cta: { label: "Sign in", hrefVar: "link" },
    },
  },
  join_request_rejected: {
    subject: "An update on your request to join {{tenant}}",
    body: "Hi,\n\nThanks for your interest in {{tenant}}. After review, your request to join wasn't approved at this time.\n\nIf you think this was a mistake, please reach out to the {{tenant}} team.",
    layout: {
      preheader: "An update on your request to join {{tenant}}.",
      heading: "Your request to join {{tenant}}",
      intro: [
        "Thanks for your interest in {{tenant}}. After review, your request to join wasn't approved at this time.",
        "If you think this was a mistake, please reach out to the {{tenant}} team.",
      ],
    },
  },
  receipt: {
    subject: "Your receipt from {{appName}}",
    body: "Hi,\n\nWe received your payment of {{amount}}. Thank you — this email is your receipt for your records.",
  },
  refund: {
    subject: "Your refund from {{appName}}",
    body: "Hi,\n\nWe've processed a refund of {{amount}} back to your original payment method. It may take a few business days to appear.",
  },
};
