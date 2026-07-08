import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/system/Reveal";
import { SERVICES } from "@/lib/data/services";
import { PROCESS } from "@/lib/data/site";

export const metadata: Metadata = {
  title: "Services — Uprise Labs",
  description:
    "One team for strategy, design, engineering, and rapid response — everything a progressive campaign needs to win online.",
};

export default function ServicesPage() {
  return (
    <main>
      {/* Hero – pt-40 clears the fixed header */}
      <section className="mx-auto max-w-[1360px] px-6 pt-40 pb-16 lg:px-10">
        <Reveal>
          <div className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            SERVICES / CAPABILITIES
          </div>
          <h1
            className="max-w-[1100px] font-extrabold leading-[0.95] tracking-[-0.04em]"
            style={{ fontSize: "clamp(44px,7vw,104px)" }}
          >
            Everything you need to win online.
          </h1>
          <p className="mt-7 max-w-[600px] text-[19px] leading-normal text-ink/60">
            One team for strategy, design, engineering, and rapid response — so nothing falls
            between the cracks when it matters most.
          </p>
        </Reveal>
      </section>

      {/* Service index – each row links through to its detail page */}
      <section className="mx-auto max-w-[1360px] px-6 pb-24 lg:px-10">
        {SERVICES.map((service, i) => (
          <Reveal key={service.slug} delay={i * 60}>
            <Link
              href={`/services/${service.slug}`}
              className="grid grid-cols-1 items-baseline gap-4 border-b border-hairline px-3 py-8 transition-colors duration-300 hover:bg-ink/5 md:grid-cols-[110px_1fr_1.2fr_40px] md:gap-10"
            >
              <div className="font-mono text-[15px] text-vermilion">{service.no}</div>
              <h3 className="text-[24px] font-bold tracking-[-0.02em]">{service.title}</h3>
              <div>
                <p className="mb-4 text-[17px] leading-relaxed text-ink/60">{service.long}</p>
                <div className="flex flex-wrap gap-2">
                  {service.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-pill border border-ink/20 px-3.5 py-1.5 font-mono text-xs text-ink/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right text-[22px] text-vermilion">→</div>
            </Link>
          </Reveal>
        ))}
      </section>

      {/* How we work – dark process band */}
      <section className="bg-ink py-24 text-cream">
        <div className="mx-auto max-w-[1360px] px-6 lg:px-10">
          <Reveal>
            <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
              HOW WE WORK
            </div>
            <h2
              className="mb-14 font-extrabold tracking-[-0.03em]"
              style={{ fontSize: "clamp(30px,4vw,52px)" }}
            >
              A process built for deadlines that don&rsquo;t move
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-px border border-hairline-dark bg-hairline-dark sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((step, i) => (
              <Reveal key={step.no} delay={i * 80} className="h-full">
                <div className="flex h-full min-h-[220px] flex-col justify-between bg-ink px-7 py-9">
                  <div className="font-mono text-sm text-vermilion">{step.no}</div>
                  <div>
                    <div className="mb-3 text-2xl font-semibold tracking-[-0.02em]">
                      {step.title}
                    </div>
                    <div className="text-sm leading-normal text-cream/55">{step.desc}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
