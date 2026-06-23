import Link from "next/link";
import { Button } from "@yarns/ui";
import { MessageSquareText, MessageCircle, Phone, MapPin, Users, Workflow } from "lucide-react";

const FEATURES = [
  { icon: MessageSquareText, title: "SMS broadcasts", body: "Compliant, rate-limited bulk SMS with delivery tracking and a unified inbox." },
  { icon: MessageCircle, title: "WhatsApp", body: "Opt-in WhatsApp lists and templated business messaging on the same audience." },
  { icon: Phone, title: "Voice", body: "Outbound calling with live status and recording, wired to the same contacts." },
  { icon: MapPin, title: "Canvassing", body: "Turf cutting, walk lists and a field app for door-knocking at scale." },
  { icon: Users, title: "Audiences", body: "Dynamic segments, identity resolution and multi-source contact provenance." },
  { icon: Workflow, title: "Journeys", body: "Automate follow-ups across channels with condition + wait + action rungs." },
];

export default function LandingPage() {
  return (
    <main>
      <section className="mx-auto w-full max-w-page px-6 pb-16 pt-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-foreground md:text-6xl">
          Organise across every channel, from one platform.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          SMS, WhatsApp, voice and canvassing — with shared audiences, consent, a unified inbox and
          automated journeys. Built for organisers who need to move people to act now.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="default" asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/request-demo">Request a demo</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-page px-6 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-lg border border-border bg-white p-6 shadow-card">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 text-lg font-bold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-4 px-6 py-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight">Ready to move your people?</h2>
          <p className="max-w-xl text-muted-foreground">Spin up a workspace in minutes — no card required to start.</p>
          <Button size="default" asChild>
            <Link href="/sign-up">Create your workspace</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
