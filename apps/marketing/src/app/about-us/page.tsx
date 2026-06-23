import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "About us — Foment" };

export default function AboutPage() {
  return (
    <ContentPage title="About Foment">
      <p>
        Foment is a multichannel organising platform built for campaigns and community groups who
        need to reach people across SMS, WhatsApp, voice and the doorstep — from one shared system
        of record.
      </p>
      <p>
        We bring messaging, canvassing, audiences, consent and a unified inbox together so
        organisers spend less time wrangling tools and more time moving people to act.
      </p>
    </ContentPage>
  );
}
