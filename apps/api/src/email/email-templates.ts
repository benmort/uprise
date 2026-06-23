export interface EmailTemplateDef {
  subject: string;
  body: string;
}

/**
 * Built-in transactional email templates (ported from prog's templates.ts). A
 * tenant can override any key with an `email.EmailTemplate` row; these are the
 * fallback so transactional email works without seeding. `{{var}}` placeholders.
 */
export const DEFAULT_EMAIL_TEMPLATES: Record<string, EmailTemplateDef> = {
  welcome: { subject: "Welcome to {{appName}}", body: "Hi {{name}},\n\nWelcome to {{appName}}." },
  magic_link: { subject: "Your sign-in link", body: "Sign in here: {{link}}\n\nThis link expires shortly." },
  verification: { subject: "Verify your email", body: "Your verification code is {{code}}." },
  invitation: { subject: "You've been invited to {{tenant}}", body: "Accept your invitation: {{link}}" },
  recovery: { subject: "Reset your password", body: "Reset your password: {{link}}" },
  contact_form: { subject: "New contact form submission", body: "{{message}}" },
  demo_request: { subject: "New demo request", body: "{{message}}" },
  newsletter: { subject: "{{subject}}", body: "{{body}}" },
  receipt: {
    subject: "Your receipt from {{appName}}",
    body: "Hi,\n\nWe received your payment of {{amount}}. Thank you.",
  },
  refund: {
    subject: "Your refund from {{appName}}",
    body: "Hi,\n\nA refund of {{amount}} has been processed to your payment method.",
  },
};
