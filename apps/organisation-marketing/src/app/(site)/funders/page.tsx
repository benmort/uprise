import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/system/Reveal";
import { STATS } from "@/lib/data/site";
import {
  FUNDERS_HERO,
  FUNDERS_THESIS,
  FUNDERS_WHY,
  FUNDING_USES,
  FUNDERS_COOP,
  FUNDERS_FAQS,
  FUNDERS_CTA,
} from "@/lib/data/funders";

export const metadata: Metadata = {
  title: "For funders – Uprise Labs",
  description:
    "We build the digital infrastructure the movement depends on. A worker-owned cooperative making the case for funding shared, movement-owned tools for a fairer, more democratic Australia.",
};

export default function FundersPage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-[1360px] px-6 pb-14 pt-40 lg:px-10">
        <Reveal>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            {FUNDERS_HERO.eyebrow}
          </p>
          <h1
            className="max-w-[1000px] font-extrabold leading-[1.0] tracking-[-0.035em]"
            style={{ fontSize: "clamp(36px,4.6vw,64px)" }}
          >
            {FUNDERS_HERO.title}
          </h1>
        </Reveal>
        <div className="mt-10 grid max-w-[1000px] gap-8 md:grid-cols-2">
          {FUNDERS_HERO.intro.map((para, i) => (
            <Reveal key={i} delay={i * 120}>
              <p className="text-[19px] leading-relaxed text-ink/75">{para}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* The thesis */}
      <section className="mx-auto max-w-[1360px] px-6 pb-20 pt-10 lg:px-10">
        <Reveal>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            {FUNDERS_THESIS.label}
          </h2>
          <p
            className="mb-8 max-w-[900px] font-extrabold tracking-[-0.03em]"
            style={{ fontSize: "clamp(26px,3.2vw,42px)" }}
          >
            {FUNDERS_THESIS.heading}
          </p>
        </Reveal>
        <div className="grid max-w-[1000px] gap-8 md:grid-cols-2">
          {FUNDERS_THESIS.body.map((para, i) => (
            <Reveal key={i} delay={i * 120}>
              <p className="text-[18px] leading-relaxed text-ink/70">{para}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Why philanthropy */}
      <section className="mx-auto max-w-[1360px] px-6 pb-24 pt-10 lg:px-10">
        <Reveal>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            {FUNDERS_WHY.label}
          </h2>
          <p
            className="mb-8 max-w-[900px] font-extrabold tracking-[-0.03em]"
            style={{ fontSize: "clamp(26px,3.2vw,42px)" }}
          >
            {FUNDERS_WHY.heading}
          </p>
        </Reveal>
        <div className="grid max-w-[1000px] gap-8 md:grid-cols-2">
          {FUNDERS_WHY.body.map((para, i) => (
            <Reveal key={i} delay={i * 120}>
              <p className="text-[18px] leading-relaxed text-ink/70">{para}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* What your support enables */}
      <section className="mx-auto max-w-[1360px] px-6 pb-24 pt-10 lg:px-10">
        <Reveal>
          <h2 className="mb-10 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            What your support enables
          </h2>
        </Reveal>
        <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-3">
          {FUNDING_USES.map((use, i) => (
            <Reveal key={use.label} delay={i * 100} className="bg-cream px-10 py-12">
              <div className="mb-4 font-mono text-[13px] text-vermilion">{`0${i + 1}`}</div>
              <h3 className="mb-3 text-[22px] font-bold tracking-[-0.02em]">{use.label}</h3>
              <p className="leading-[1.55] text-ink/60">{use.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* The co-op as a feature */}
      <section className="mx-auto max-w-[1360px] px-6 pb-24 pt-10 lg:px-10">
        <Reveal>
          <h2 className="mb-10 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            Why fund a cooperative
          </h2>
        </Reveal>
        <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2">
          {FUNDERS_COOP.map((v, i) => (
            <Reveal key={v.no} delay={(i % 2) * 100} className="bg-cream px-10 py-12">
              <div className="mb-4 font-mono text-[13px] text-vermilion">{v.no}</div>
              <h3 className="mb-3 text-[22px] font-bold tracking-[-0.02em]">{v.title}</h3>
              <p className="leading-[1.55] text-ink/60">{v.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Track record – reuse the stats band */}
      <section className="mx-auto max-w-[1360px] px-6 pb-24 pt-10 lg:px-10">
        <Reveal>
          <h2 className="mb-10 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            The record so far
          </h2>
        </Reveal>
        <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={(i % 4) * 80} className="bg-cream px-8 py-10">
              <div className="font-extrabold tracking-[-0.03em]" style={{ fontSize: "clamp(30px,3.4vw,48px)" }}>
                {s.value}
              </div>
              <div className="mt-2 font-mono text-xs uppercase text-ink/55">{s.label}</div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-6 max-w-[760px] text-[15px] leading-relaxed text-ink/55">
            We build the platform behind uprise.org.au and partner with organisations including Common Threads
            and Climate 200. See the work in detail on our{" "}
            <Link href="/work" className="text-vermilion underline underline-offset-4 hover:no-underline">
              case studies
            </Link>
            .
          </p>
        </Reveal>
      </section>

      {/* Funder FAQs */}
      <section className="mx-auto max-w-[1360px] px-6 pb-24 pt-10 lg:px-10">
        <Reveal>
          <h2 className="mb-10 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            Questions funders ask
          </h2>
        </Reveal>
        <div className="mx-auto max-w-[880px] divide-y divide-hairline border-y border-hairline">
          {FUNDERS_FAQS.map((f, i) => (
            <Reveal key={i} delay={(i % 3) * 80} className="py-7">
              <h3 className="mb-2 text-[20px] font-bold tracking-[-0.01em]">{f.q}</h3>
              <p className="leading-relaxed text-ink/65">{f.a}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Dual-ask CTA */}
      <section className="mx-auto max-w-[1360px] px-6 pb-32 pt-6 lg:px-10">
        <Reveal className="border-t border-hairline pt-14">
          <p
            className="mb-6 max-w-[820px] font-extrabold tracking-[-0.03em]"
            style={{ fontSize: "clamp(30px,4vw,56px)" }}
          >
            {FUNDERS_CTA.heading}
          </p>
          <p className="mb-8 max-w-[640px] text-[19px] leading-relaxed text-ink/70">{FUNDERS_CTA.body}</p>
          <div className="flex flex-wrap gap-4">
            {FUNDERS_CTA.buttons.map((b, i) => (
              <Link
                key={b.href}
                href={b.href}
                className={
                  i === 0
                    ? "rounded-full bg-ink px-7 py-3.5 text-sm font-bold text-cream transition-colors hover:bg-vermilion"
                    : "rounded-full border border-ink px-7 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-ink hover:text-cream"
                }
              >
                {b.label} →
              </Link>
            ))}
          </div>
        </Reveal>
      </section>
    </main>
  );
}
