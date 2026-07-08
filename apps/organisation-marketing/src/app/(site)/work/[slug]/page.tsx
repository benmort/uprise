import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaPlaceholder } from "@/components/system/MediaPlaceholder";
import { Reveal } from "@/components/system/Reveal";
import { PROJECTS, getCaseDetail, getProject } from "@/lib/data/projects";

/**
 * Case-study template — the prototype's pCase view. One route per project;
 * every content string renders from CASE_DETAILS so the content pass edits
 * data, not markup.
 */

const CONTAINER = "mx-auto max-w-[1360px] px-6 lg:px-10";

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export default function CaseStudyPage({ params }: { params: { slug: string } }) {
  const project = getProject(params.slug);
  const detail = getCaseDetail(params.slug);
  if (!project || !detail) notFound();

  return (
    <div className="pt-40">
      {/* Back link, meta and title */}
      <section className={CONTAINER}>
        <Link
          href="/work"
          className="inline-flex items-center gap-2 font-mono text-[13px] font-medium text-ink/55 transition-colors hover:text-vermilion"
        >
          <span aria-hidden>←</span> BACK TO WORK
        </Link>
        <div className="mb-[18px] mt-10 font-mono text-xs font-medium tracking-[0.06em] text-vermilion">
          {detail.meta}
        </div>
        <h1
          className="max-w-[1050px] font-extrabold leading-[0.98] tracking-[-0.04em]"
          style={{ fontSize: "clamp(40px,5.5vw,80px)" }}
        >
          {detail.title}
        </h1>
      </section>

      {/* Hero image slot */}
      <section className={`${CONTAINER} py-14`}>
        <MediaPlaceholder caption={`[ ${detail.heroCaption} ]`} ratio="16/8" />
      </section>

      {/* The brief — mono fact stack beside the lede and body copy */}
      <section className={`${CONTAINER} py-[60px]`}>
        <Reveal>
          <div className="grid items-start gap-12 lg:grid-cols-[300px_1fr] lg:gap-20">
            <div>
              <div className="mb-5 font-mono text-xs font-medium tracking-[0.08em] text-vermilion">
                THE BRIEF
              </div>
              <div className="border-t border-hairline pt-[18px] font-mono text-[13px] font-medium leading-[2] text-ink/55">
                <div>CLIENT — {detail.client}</div>
                <div>SERVICES — {detail.services}</div>
                <div>TIMELINE — {detail.timeline}</div>
                <div>TEAM — {detail.team}</div>
              </div>
            </div>
            <div>
              <p
                className="mb-7 font-medium leading-[1.32] tracking-[-0.02em]"
                style={{ fontSize: "clamp(24px,2.6vw,34px)" }}
              >
                {detail.lede}
              </p>
              {detail.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className="mb-5 text-[17px] leading-[1.65] text-ink/70 last:mb-0"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* Results band — full-bleed vermilion */}
      <section className="my-[60px] bg-vermilion py-20 text-cream">
        <div className={CONTAINER}>
          <Reveal>
            <div className="grid grid-cols-2 gap-10 lg:grid-cols-4">
              {detail.results.map((r) => (
                <div key={r.label}>
                  <div
                    className="font-extrabold leading-none tracking-[-0.03em]"
                    style={{ fontSize: "clamp(40px,5vw,68px)" }}
                  >
                    {r.value}
                  </div>
                  <div className="mt-3 font-mono text-[13px] font-medium opacity-85">{r.label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Gallery */}
      <section className={`${CONTAINER} pb-10 pt-5`}>
        <div className="grid gap-7 md:grid-cols-2">
          {detail.gallery.map((caption, i) => (
            <Reveal key={caption} delay={i * 80}>
              <MediaPlaceholder caption={`[ ${caption} ]`} ratio="4/3" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Stack tags + pull quote */}
      <section className={`${CONTAINER} py-20`}>
        <Reveal>
          <div className="grid items-start gap-12 lg:grid-cols-[300px_1fr] lg:gap-20">
            <div>
              <div className="mb-5 font-mono text-xs font-medium tracking-[0.08em] text-vermilion">
                THE STACK
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.stack.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-pill border border-ink/20 px-4 py-2 font-mono text-[13px] font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="border-l-2 border-vermilion pl-6 lg:pl-9">
              <p
                className="mb-6 font-medium leading-[1.4] tracking-[-0.01em]"
                style={{ fontSize: "clamp(22px,2.4vw,30px)" }}
              >
                &ldquo;{detail.quote.text}&rdquo;
              </p>
              <div className="font-mono text-[13px] font-medium text-ink/60">
                {detail.quote.attribution}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Page footer — back to the index */}
      <section className={`${CONTAINER} pb-30 pt-10`}>
        <Reveal>
          <Link
            href="/work"
            className="flex items-center justify-between border-t border-hairline pt-8 transition-colors hover:text-vermilion"
          >
            <span className="font-mono text-xs font-medium text-ink/50">NEXT</span>
            <span
              className="font-bold tracking-[-0.02em]"
              style={{ fontSize: "clamp(24px,3vw,40px)" }}
            >
              All projects →
            </span>
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
