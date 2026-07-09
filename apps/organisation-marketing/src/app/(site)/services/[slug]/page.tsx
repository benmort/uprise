import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaPlaceholder } from "@/components/system/MediaPlaceholder";
import { Reveal } from "@/components/system/Reveal";
import { VISIBLE_SERVICES, getService, getServiceDetail } from "@/lib/data/services";

/**
 * Service detail template – transcribed from the prototype's service-detail
 * view: back link, numbered eyebrow, big title + lede, hero media slot, the
 * two-column "what you get" split, the dark four-step process grid, and a
 * centred CTA.
 */

export function generateStaticParams() {
  return VISIBLE_SERVICES.map((service) => ({ slug: service.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const service = getService(params.slug);
  return service ? { title: `${service.title} — Uprise Labs` } : {};
}

export default function ServiceDetailPage({ params }: { params: { slug: string } }) {
  const service = getService(params.slug);
  const detail = getServiceDetail(params.slug);
  // Hidden services stay in the catalogue but are unreachable — no orphan live page.
  if (!service || !detail || service.hidden) notFound();

  return (
    <div className="pt-40">
      {/* Back link + title + lede */}
      <section className="mx-auto max-w-[1360px] px-6 lg:px-10">
        <Link
          href="/services"
          className="inline-flex items-center gap-2 font-mono text-[13px] font-medium text-ink/55 transition-colors hover:text-vermilion"
        >
          ← ALL SERVICES
        </Link>
        <div className="mb-[18px] mt-10 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
          SERVICE {service.no}
        </div>
        <h1
          className="max-w-[1050px] font-extrabold leading-[0.96] tracking-[-0.04em]"
          style={{ fontSize: "clamp(40px,5.5vw,84px)" }}
        >
          {service.title}
        </h1>
        <p
          className="mt-8 max-w-[760px] font-medium leading-[1.4] text-ink/70"
          style={{ fontSize: "clamp(22px,2.4vw,30px)" }}
        >
          {detail.lede}
        </p>
      </section>

      {/* Hero media slot */}
      <section className="mx-auto max-w-[1360px] px-6 py-[70px] lg:px-10">
        <Reveal>
          <MediaPlaceholder caption={`[ ${detail.heroCaption} ]`} ratio="16/7" />
        </Reveal>
      </section>

      {/* What you get – deliverables + body copy */}
      <section className="mx-auto max-w-[1360px] px-6 pb-10 pt-5 lg:px-10">
        <Reveal>
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
            <div>
              <div className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
                WHAT YOU GET
              </div>
              <div className="flex flex-col gap-3 border-t border-hairline pt-[18px]">
                {detail.deliverables.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 font-mono text-sm font-medium leading-[1.5] text-ink/70"
                  >
                    <span className="text-vermilion" aria-hidden>◆</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              {detail.body.map((para) => (
                <p key={para} className="mb-6 text-lg leading-[1.65] text-ink/70">
                  {para}
                </p>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* How it ships – dark four-step process grid */}
      <section className="mt-[60px] bg-ink py-[110px] text-cream">
        <div className="mx-auto max-w-[1360px] px-6 lg:px-10">
          <Reveal>
            <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
              HOW IT SHIPS
            </div>
            <h2
              className="mb-[52px] font-extrabold tracking-[-0.03em]"
              style={{ fontSize: "clamp(28px,3.4vw,46px)" }}
            >
              Four steps from audit to election day
            </h2>
            <div className="grid gap-px border border-hairline-dark bg-hairline-dark sm:grid-cols-2 lg:grid-cols-4">
              {detail.steps.map((step) => (
                <div
                  key={step.no}
                  className="flex min-h-[200px] flex-col justify-between bg-ink px-7 py-9"
                >
                  <div className="font-mono text-sm font-medium text-vermilion">{step.no}</div>
                  <div>
                    <div className="mb-2.5 text-[23px] font-semibold tracking-[-0.02em]">
                      {step.title}
                    </div>
                    <div className="text-sm leading-[1.5] text-cream/60">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1360px] px-6 py-24 text-center lg:px-10">
        <Reveal>
          <h2
            className="mx-auto max-w-[820px] font-extrabold leading-none tracking-[-0.03em]"
            style={{ fontSize: "clamp(32px,5vw,72px)" }}
          >
            {detail.cta.heading}
          </h2>
          <Link
            href="/contact"
            className="mt-10 inline-flex items-center gap-3 rounded-pill bg-vermilion px-[34px] py-[18px] text-[17px] font-semibold text-cream transition-colors hover:bg-ink"
          >
            {detail.cta.button}
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
