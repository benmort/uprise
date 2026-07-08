import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/system/Reveal";
import { FAQS, TIERS } from "@/lib/data/pricing";

export const metadata: Metadata = {
  title: "Pricing — Uprise Labs",
  description:
    "Fixed-scope sprints for a single race, or a standing retainer for a whole operation. No corporate markup — you are the movement, and we price like it.",
};

export default function PricingPage() {
  return (
    <main>
      {/* Hero – pt-40 clears the fixed header */}
      <section className="mx-auto max-w-[1360px] px-6 pt-40 pb-16 lg:px-10">
        <Reveal>
          <div className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            PRICING / ENGAGEMENTS
          </div>
          <h1
            className="max-w-[1100px] font-extrabold leading-[0.95] tracking-[-0.04em]"
            style={{ fontSize: "clamp(44px,7vw,104px)" }}
          >
            Priced for the pace of a cycle.
          </h1>
          <p className="mt-7 max-w-[620px] text-[19px] leading-normal text-ink/60">
            Fixed-scope sprints for a single race, or a standing retainer for a whole operation.
            No corporate markup — you are the movement, and we price like it.
          </p>
        </Reveal>
      </section>

      {/* Tiers – featured card flips to the dark palette */}
      <section className="mx-auto max-w-[1360px] px-6 pb-16 lg:px-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 60} className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-card border p-8 ${
                  tier.featured
                    ? "border-ink bg-ink text-cream"
                    : "border-hairline bg-cream"
                }`}
              >
                <div className="mb-7 flex items-center justify-between">
                  <div className="font-mono text-[13px] font-semibold tracking-[0.08em] text-vermilion">
                    {tier.name}
                  </div>
                  {tier.featured && (
                    <span className="rounded-pill bg-vermilion px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-cream">
                      POPULAR
                    </span>
                  )}
                </div>
                <div className="mb-2 flex items-baseline gap-2">
                  <span
                    className="font-extrabold leading-none tracking-[-0.03em]"
                    style={{ fontSize: "clamp(38px,4vw,56px)" }}
                  >
                    {tier.price}
                  </span>
                  <span className="font-mono text-[13px] opacity-60">{tier.unit}</span>
                </div>
                <p className="mb-7 text-[15.5px] leading-normal opacity-70">{tier.tagline}</p>
                <div className="mb-8 flex flex-1 flex-col gap-3.5">
                  {tier.features.map((feature) => (
                    <div
                      key={feature}
                      className="flex items-start gap-3 text-[15px] leading-snug"
                    >
                      <span className="flex-none text-vermilion">✳</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/contact"
                  className={`rounded-pill border py-3.5 text-center text-[15px] font-semibold transition-colors hover:border-vermilion hover:bg-vermilion hover:text-cream ${
                    tier.featured
                      ? "border-vermilion bg-vermilion text-cream"
                      : "border-ink/25 text-ink"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[1360px] px-6 pt-16 pb-32 lg:px-10">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_1.5fr]">
          <Reveal>
            <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
              FAQ
            </div>
            <h2
              className="font-extrabold tracking-[-0.03em]"
              style={{ fontSize: "clamp(28px,3.4vw,44px)" }}
            >
              Questions we get
              <br />a lot
            </h2>
          </Reveal>
          <div>
            {FAQS.map((faq, i) => (
              <Reveal key={faq.q} delay={i * 60}>
                <div className="border-t border-hairline py-6">
                  <div className="mb-3 text-[21px] font-bold tracking-[-0.01em]">{faq.q}</div>
                  <p className="max-w-[640px] text-base leading-relaxed text-ink/60">{faq.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
