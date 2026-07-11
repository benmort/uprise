import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/system/Reveal";
import { IMPACT_HERO, IMPACT_HIGHLIGHTS, IMPACT_NOTE } from "@/lib/data/impact";
import { PROJECTS } from "@/lib/data/projects";

export const metadata: Metadata = {
  title: "Impact – Uprise Labs",
  description:
    "What we build for the progressive movement, and what it adds up to – reported honestly, with unverified figures marked rather than inflated.",
};

export default function ImpactPage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-[1360px] px-6 pb-14 pt-40 lg:px-10">
        <Reveal>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            {IMPACT_HERO.eyebrow}
          </p>
          <h1
            className="max-w-[1000px] font-extrabold leading-[1.0] tracking-[-0.035em]"
            style={{ fontSize: "clamp(36px,4.6vw,64px)" }}
          >
            {IMPACT_HERO.title}
          </h1>
        </Reveal>
        <div className="mt-10 grid max-w-[1000px] gap-8 md:grid-cols-2">
          {IMPACT_HERO.intro.map((para, i) => (
            <Reveal key={i} delay={i * 120}>
              <p className="text-[19px] leading-relaxed text-ink/75">{para}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-[1360px] px-6 pb-16 pt-6 lg:px-10">
        <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {IMPACT_HIGHLIGHTS.map((s, i) => (
            <Reveal key={s.label} delay={(i % 4) * 80} className="bg-cream px-8 py-10">
              <div className="font-extrabold tracking-[-0.03em]" style={{ fontSize: "clamp(30px,3.4vw,48px)" }}>
                {s.value}
              </div>
              <div className="mt-2 font-mono text-xs uppercase text-ink/55">{s.label}</div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-6 max-w-[760px] text-[15px] leading-relaxed text-ink/55">{IMPACT_NOTE}</p>
        </Reveal>
      </section>

      {/* The work behind the numbers */}
      <section className="mx-auto max-w-[1360px] px-6 pb-28 pt-10 lg:px-10">
        <Reveal>
          <div className="mb-10 flex items-end justify-between border-b border-hairline pb-6">
            <h2 className="font-extrabold tracking-[-0.03em]" style={{ fontSize: "clamp(30px,4vw,52px)" }}>
              The work behind the numbers
            </h2>
            <Link
              href="/work"
              className="hidden font-mono text-xs uppercase tracking-[0.12em] text-vermilion hover:underline sm:block"
            >
              All work →
            </Link>
          </div>
        </Reveal>
        <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-3">
          {PROJECTS.map((p, i) => (
            <Reveal key={p.slug} delay={(i % 3) * 100} className="bg-cream px-8 py-10">
              <Link href={`/work/${p.slug}`} className="group block">
                <div className="mb-3 font-mono text-[12px] uppercase tracking-[0.1em] text-ink/45">
                  {p.tag} · {p.year}
                </div>
                <h3 className="mb-2 text-[22px] font-bold tracking-[-0.02em] group-hover:text-vermilion">
                  {p.name}
                </h3>
                <p className="leading-[1.5] text-ink/60">{p.blurb}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1360px] px-6 pb-32 pt-2 lg:px-10">
        <Reveal className="border-t border-hairline pt-14">
          <p
            className="mb-6 max-w-[820px] font-extrabold tracking-[-0.03em]"
            style={{ fontSize: "clamp(30px,4vw,56px)" }}
          >
            Want to help build the next number?
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/funders"
              className="rounded-full bg-ink px-7 py-3.5 text-sm font-bold text-cream transition-colors hover:bg-vermilion"
            >
              For funders →
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-ink px-7 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-ink hover:text-cream"
            >
              Start a project →
            </Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
