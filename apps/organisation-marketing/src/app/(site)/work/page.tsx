"use client";

import { useState } from "react";
import Link from "next/link";

import { MediaPlaceholder } from "@/components/system/MediaPlaceholder";
import { Reveal } from "@/components/system/Reveal";
import { PROJECTS } from "@/lib/data/projects";
import type { ProjectTag } from "@/lib/data/types";

// Filter pills – "All" plus the tags actually used by real work.
const FILTERS = ["All", "Platform", "Organising", "Campaigns"] as const;

type Filter = (typeof FILTERS)[number];

export default function WorkPage() {
  const [filter, setFilter] = useState<Filter>("All");
  const filtered =
    filter === "All" ? PROJECTS : PROJECTS.filter((p) => p.tag === (filter as ProjectTag));

  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-[1360px] px-6 pb-16 pt-40 lg:px-10">
        <div className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
          WORK / {PROJECTS.length} PROJECTS
        </div>
        <h1
          className="max-w-[1100px] font-extrabold leading-[0.95] tracking-[-0.04em]"
          style={{ fontSize: "clamp(44px,7vw,104px)" }}
        >
          Selected work.
        </h1>
        <p className="mt-7 max-w-[560px] text-[19px] leading-normal text-ink/60">
          The platforms, tools and campaigns we've built with and for the progressive movement across
          Australia.
        </p>
      </section>

      {/* Filter bar */}
      <section className="mx-auto max-w-[1360px] px-6 pb-10 lg:px-10">
        <div className="flex flex-wrap gap-2.5 border-b border-hairline pb-7">
          {FILTERS.map((name) => {
            const active = filter === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setFilter(name)}
                className={`rounded-pill border px-[18px] py-[9px] text-sm font-semibold transition-colors duration-200 ${
                  active
                    ? "border-ink bg-ink text-cream"
                    : "border-ink/20 bg-transparent text-ink hover:border-ink"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Project grid – the home card pattern, two across */}
      <section className="mx-auto max-w-[1360px] px-6 pb-30 lg:px-10">
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2">
          {filtered.map((p) => (
            <Reveal key={p.slug}>
              <Link href={`/work/${p.slug}`} className="group block">
                <div className="overflow-hidden rounded-card">
                  <MediaPlaceholder
                    caption={`[ ${p.name} — SCREENSHOT ]`}
                    ratio="16/10"
                    topRight={p.year}
                    className="transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
                  />
                </div>
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
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  );
}
