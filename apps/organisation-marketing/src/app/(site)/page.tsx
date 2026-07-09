import Link from "next/link";

import { Marquee } from "@/components/system/Marquee";
import { MediaPlaceholder } from "@/components/system/MediaPlaceholder";
import { Reveal } from "@/components/system/Reveal";
import { RotatingWord } from "@/components/system/RotatingWord";
import { PROJECTS } from "@/lib/data/projects";
import { VISIBLE_SERVICES } from "@/lib/data/services";
import {
  CAPABILITIES,
  HERO,
  HERO_WORDS,
  POSITIONING,
  STATS,
  TESTIMONIALS,
} from "@/lib/data/site";

const container = "mx-auto max-w-[1360px] px-6 lg:px-10";

// The prototype breaks the hero H1 after "digital" – split the data string there.
const heroBreak = HERO.titlePrefix.indexOf(" backbone");
const heroLine1 = heroBreak === -1 ? HERO.titlePrefix : HERO.titlePrefix.slice(0, heroBreak);
const heroLine2 = heroBreak === -1 ? "" : HERO.titlePrefix.slice(heroBreak + 1);

// The prototype renders this segment of the positioning statement in vermilion.
const POSITIONING_ACCENT =
  "exclusively with candidates, causes, and coalitions on the progressive left.";
const [positioningBefore, positioningAfter] = POSITIONING.statement.split(POSITIONING_ACCENT);

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className={`relative overflow-hidden ${container} pb-16 pt-40`}>
        <div
          className="pointer-events-none absolute right-[72px] top-[96px] h-[340px] w-[340px] rounded-full opacity-[0.14]"
          style={{
            background: "radial-gradient(circle at 30% 30%, #EC4A2B, #c9351d)",
            // Blur lives in the animation (it breathes the focus); base is its 0% frame.
            filter: "blur(15px)",
            animation: "blobDrift 40s ease-in-out infinite",
            willChange: "transform, filter",
          }}
        />
        <div className="max-w-[1120px]">
          <Reveal className="mb-[34px]">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
              {HERO.eyebrow}
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1
              className="font-extrabold leading-[0.98] tracking-[-0.035em]"
              style={{ fontSize: "clamp(44px,6.6vw,94px)" }}
            >
              {heroLine1}
              <br />
              {heroLine2} <RotatingWord words={HERO_WORDS} />
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-11 flex flex-wrap items-end gap-[60px]">
              <p className="max-w-[440px] text-[19px] leading-[1.5] text-ink/65">{HERO.sub}</p>
              <div className="flex gap-3.5">
                <Link
                  href="/work"
                  className="inline-flex items-center gap-2.5 rounded-pill bg-vermilion px-[26px] py-[15px] text-[15px] font-semibold text-cream transition-colors hover:bg-ink"
                >
                  See the work <span>→</span>
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center rounded-pill border border-ink/25 px-[26px] py-[15px] text-[15px] font-semibold transition-colors hover:border-ink hover:bg-ink hover:text-cream"
                >
                  Get in touch
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
        <div className="mt-20 flex items-center gap-2.5 font-mono text-xs tracking-[0.1em] text-ink/40">
          <span className="inline-block" style={{ animation: "bob 2s ease-in-out infinite" }}>
            ↓
          </span>{" "}
          SCROLL TO EXPLORE
        </div>
      </section>

      {/* Capabilities marquee */}
      <Reveal>
        <div className="mt-10 border-y border-ink bg-vermilion py-[22px] text-cream">
          <Marquee durationS={26}>
            {CAPABILITIES.map((c) => (
              <span key={c} className="flex items-center whitespace-nowrap">
                <span className="px-[30px] text-[30px] font-bold tracking-[-0.02em]">{c}</span>
                <span aria-hidden className="text-[19px] leading-none opacity-55">◆</span>
              </span>
            ))}
          </Marquee>
        </div>
      </Reveal>

      {/* Positioning */}
      <section className={`${container} py-[120px]`}>
        <Reveal>
          <div className="grid items-start gap-10 md:grid-cols-[1fr_1.15fr] md:gap-20">
            <div>
              <div className="mb-5 font-mono text-xs tracking-[0.1em] text-vermilion">
                (01) WHO WE ARE
              </div>
              <div className="font-mono text-[13px] leading-[1.8] text-ink/55">
                {POSITIONING.meta.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
            <p
              className="font-medium leading-[1.28] tracking-[-0.02em]"
              style={{ fontSize: "clamp(26px,3vw,40px)" }}
            >
              {positioningAfter === undefined ? (
                POSITIONING.statement
              ) : (
                <>
                  {positioningBefore}
                  <span className="text-vermilion">{POSITIONING_ACCENT}</span>
                  {positioningAfter}
                </>
              )}
            </p>
          </div>
        </Reveal>
      </section>

      {/* Stats */}
      <section className={`${container} pb-[120px]`}>
        <Reveal>
          <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="bg-cream px-8 py-10">
                <div
                  className="font-extrabold leading-none tracking-[-0.03em]"
                  style={{ fontSize: "clamp(38px,4.5vw,60px)" }}
                >
                  {s.value}
                </div>
                <div className="mt-3 font-mono text-xs tracking-[0.02em] text-ink/55">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Selected work */}
      <section className={`${container} pb-[120px]`}>
        <Reveal>
          <div className="mb-[52px] flex items-end justify-between border-b border-hairline pb-6">
            <div>
              <div className="mb-3.5 font-mono text-xs tracking-[0.1em] text-vermilion">
                (02) SELECTED WORK
              </div>
              <h2
                className="font-extrabold tracking-[-0.03em]"
                style={{ fontSize: "clamp(30px,4vw,52px)" }}
              >
                Platforms that moved the needle
              </h2>
            </div>
            <Link
              href="/work"
              className="flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold transition-colors hover:text-vermilion"
            >
              All projects <span>→</span>
            </Link>
          </div>
          <div className="grid gap-x-8 gap-y-10 md:grid-cols-2">
            {PROJECTS.slice(0, 4).map((p) => (
              <Link key={p.slug} href={`/work/${p.slug}`} className="group">
                <MediaPlaceholder
                  caption={`[ ${p.name.toUpperCase()} — SCREENSHOT ]`}
                  ratio="16/10"
                  topRight={p.year}
                  className="transition-transform duration-500 group-hover:scale-[1.02]"
                />
                <div className="mt-[18px] flex items-baseline justify-between gap-4">
                  <div>
                    <div className="mb-[7px] font-mono text-xs tracking-[0.05em] text-vermilion">
                      {p.tag}
                    </div>
                    <div className="text-[23px] font-semibold leading-[1.18] tracking-[-0.02em]">
                      {p.blurb}
                    </div>
                  </div>
                  <div className="flex-none text-xl">↗</div>
                </div>
              </Link>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Services teaser */}
      <section className="bg-ink py-[120px] text-cream">
        <div className={container}>
          <Reveal>
            <div className="mb-3.5 font-mono text-xs tracking-[0.1em] text-vermilion">
              (03) WHAT WE DO
            </div>
            <h2
              className="mb-14 max-w-[700px] font-extrabold tracking-[-0.03em]"
              style={{ fontSize: "clamp(30px,4vw,54px)" }}
            >
              Full-stack digital, built for the pace of politics
            </h2>
            <div className="border-t border-hairline-dark">
              {VISIBLE_SERVICES.map((s) => (
                <Link
                  key={s.slug}
                  href={`/services/${s.slug}`}
                  className="grid items-center gap-2 border-b border-hairline-dark px-2 py-[30px] transition-colors hover:bg-cream/5 md:grid-cols-[80px_1fr_1.3fr_40px] md:gap-6"
                >
                  <div className="font-mono text-[13px] text-vermilion">{s.no}</div>
                  <div className="text-[26px] font-semibold tracking-[-0.02em]">{s.title}</div>
                  <div className="text-[15px] leading-[1.5] text-cream/60">{s.desc}</div>
                  <div className="text-right text-xl text-vermilion">→</div>
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Testimonials */}
      <section className={`${container} py-[120px]`}>
        <Reveal>
          <div className="mb-3.5 font-mono text-xs tracking-[0.1em] text-vermilion">
            (04) FROM THE FIELD
          </div>
          <h2
            className="mb-14 max-w-[760px] font-extrabold tracking-[-0.03em]"
            style={{ fontSize: "clamp(30px,4vw,52px)" }}
          >
            The people who trusted us with a deadline
          </h2>
          <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="flex flex-col justify-between gap-9 bg-cream px-9 py-11"
              >
                <p className="text-[21px] font-medium leading-[1.4] tracking-[-0.01em]">
                  {`"${t.quote}"`}
                </p>
                <div>
                  <div className="font-mono text-[13px] font-semibold tracking-[0.02em]">
                    {t.name}
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-ink/50">{t.org}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* CTA band */}
      <section className={`${container} py-[140px] text-center`}>
        <Reveal>
          <div className="mb-6 font-mono text-xs tracking-[0.1em] text-vermilion">
            {"◆ THERE'S AN ELECTION COMING"}
          </div>
          <h2
            className="mx-auto max-w-[1000px] font-extrabold leading-[0.98] tracking-[-0.04em]"
            style={{ fontSize: "clamp(40px,7vw,100px)" }}
          >
            {"Let's build power"}
            <br />
            together.
          </h2>
          <Link
            href="/contact"
            className="mt-12 inline-flex items-center gap-3 rounded-pill bg-vermilion px-[34px] py-[18px] text-[17px] font-semibold text-cream transition-colors hover:bg-ink"
          >
            Start a project <span>→</span>
          </Link>
        </Reveal>
      </section>
    </>
  );
}
