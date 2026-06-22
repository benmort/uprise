import Link from "next/link";
import { Button } from "@yarns/ui";
import { Check } from "lucide-react";

const TIERS = [
  {
    name: "Starter",
    price: "$49",
    blurb: "For a single campaign getting going.",
    features: ["SMS + WhatsApp broadcasts", "Unified inbox", "1 workspace", "Up to 5 organisers"],
    cta: "Get started",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$149",
    blurb: "For teams running multiple channels.",
    features: ["Everything in Starter", "Voice calling", "Canvassing + field app", "Dynamic audiences & journeys", "Up to 25 organisers"],
    cta: "Get started",
    highlight: true,
  },
  {
    name: "Scale",
    price: "$298",
    blurb: "For networks coordinating many tenants.",
    features: ["Everything in Growth", "Multi-tenant networks", "Priority support", "Unlimited organisers"],
    cta: "Talk to us",
    highlight: false,
  },
];

export default function PlansPage() {
  return (
    <main className="mx-auto w-full max-w-page px-6 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">Simple, transparent pricing</h1>
        <p className="mt-3 text-muted-foreground">Per month, billed annually. Start free — upgrade when you&apos;re ready.</p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={`flex flex-col rounded-xl border bg-white p-6 ${t.highlight ? "border-primary shadow-elevated" : "border-border shadow-card"}`}
          >
            <h3 className="text-lg font-bold">{t.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
            <p className="mt-4 text-4xl font-extrabold">
              {t.price}
              <span className="text-base font-normal text-muted-foreground">/mo</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full" variant={t.highlight ? "default" : "outline"} asChild>
              <Link href={t.name === "Scale" ? "/request-demo" : "/sign-up"}>{t.cta}</Link>
            </Button>
          </div>
        ))}
      </div>
    </main>
  );
}
