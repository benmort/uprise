import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Privacy policy — Foment" };

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy policy">
      <p>This policy explains what data Foment collects, how it is used, and your rights.</p>
      <p>
        We process contact data on behalf of the organisations using Foment (the data controllers).
        We retain message and consent records to honour opt-outs and meet legal obligations, and we
        never sell personal data.
      </p>
      <p>For access, correction or deletion requests, contact us via the contact page.</p>
    </ContentPage>
  );
}
