import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Integrations — Foment" };

export default function IntegrationsPage() {
  return (
    <ContentPage title="Integrations">
      <p>Foment connects to the tools organisers already use.</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Action Network — sync people and lists into audiences.</li>
        <li>Twilio — SMS, WhatsApp and voice delivery.</li>
        <li>SendGrid — transactional email.</li>
        <li>Stripe — billing and subscriptions.</li>
      </ul>
    </ContentPage>
  );
}
