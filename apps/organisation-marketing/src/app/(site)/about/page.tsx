import type { Metadata } from "next";
import { Reveal } from "@/components/system/Reveal";
import { MediaPlaceholder } from "@/components/system/MediaPlaceholder";
import { ABOUT, VALUES, TEAM } from "@/lib/data/site";

export const metadata: Metadata = {
  title: "About — Uprise Labs",
  description: ABOUT.heroTitle,
};

export default function AboutPage() {
  return (
    <main>
      {/* Hero – eyebrow + the long founding-story title */}
      <section className="mx-auto max-w-[1360px] px-6 pb-14 pt-40 lg:px-10">
        <Reveal>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            About / Our story
          </p>
          <h1
            className="max-w-[1150px] font-extrabold leading-[1.0] tracking-[-0.035em]"
            style={{ fontSize: "clamp(36px,4.6vw,64px)" }}
          >
            {ABOUT.heroTitle}
          </h1>
        </Reveal>
      </section>

      {/* Story – the two founding paragraphs side by side */}
      <section className="mx-auto max-w-[1360px] px-6 pb-20 pt-10 lg:px-10">
        <div className="grid gap-10 md:grid-cols-2">
          {ABOUT.story.map((para, i) => (
            <Reveal key={i} delay={i * 120}>
              <p className="text-[19px] leading-relaxed text-ink/75">{para}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* What we believe – 2×2 hairline grid of values */}
      <section className="mx-auto max-w-[1360px] px-6 pb-24 pt-10 lg:px-10">
        <Reveal>
          <h2 className="mb-10 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
            What we believe
          </h2>
        </Reveal>
        <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2">
          {VALUES.map((v, i) => (
            <Reveal key={v.no} delay={(i % 2) * 100} className="bg-cream px-10 py-12">
              <div className="mb-4 font-mono text-[13px] text-vermilion">{v.no}</div>
              <h3 className="mb-3 text-[22px] font-bold tracking-[-0.02em]">{v.title}</h3>
              <p className="leading-[1.55] text-ink/60">{v.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Team – header row with mono meta, then the portrait grid */}
      <section className="mx-auto max-w-[1360px] px-6 pb-28 pt-5 lg:px-10">
        <Reveal>
          <div className="mb-11 flex items-end justify-between border-b border-hairline pb-6">
            <h2
              className="font-extrabold tracking-[-0.03em]"
              style={{ fontSize: "clamp(30px,4vw,52px)" }}
            >
              The team
            </h2>
            <div className="font-mono text-[13px] text-ink/50">{ABOUT.teamMeta}</div>
          </div>
        </Reveal>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((m, i) => (
            <Reveal key={m.name} delay={(i % 3) * 100}>
              <MediaPlaceholder caption="[ PORTRAIT ]" ratio="4/5" src={m.image} alt={m.name} />
              <div className="mt-4 text-[19px] font-bold tracking-[-0.01em]">{m.name}</div>
              <div className="mt-1.5 font-mono text-xs uppercase text-ink/55">{m.role}</div>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  );
}
