import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Security — Foment" };

export default function SecurityPage() {
  return (
    <ContentPage title="Security">
      <p>Security is foundational to how Foment is built and operated.</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Encrypted in transit (TLS) and at rest; sensitive credentials encrypted at the field level.</li>
        <li>Role-based access control (CASL) scoped per tenant, with least-privilege defaults.</li>
        <li>httpOnly session cookies, single sign-on, and short-lived tokens.</li>
        <li>Per-tenant data isolation and audited webhook idempotency.</li>
      </ul>
      <p>To report a vulnerability, contact our team via the contact page.</p>
    </ContentPage>
  );
}
