import type { Metadata } from "next";
import Link from "next/link";

import { MediaPlaceholder } from "@/components/system/MediaPlaceholder";
import { Reveal } from "@/components/system/Reveal";
import { POSTS } from "@/lib/data/posts";

export const metadata: Metadata = {
  title: "Dispatch — Uprise Labs",
  description:
    "Monthly notes on digital organising, fundraising, and shipping software under a deadline that will not move.",
};

export default function DispatchPage() {
  const featured = POSTS[0];
  const rest = POSTS.slice(1);

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-[1360px] px-6 pb-10 pt-40 lg:px-10">
        <div className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-vermilion">
          DISPATCH / FIELD NOTES
        </div>
        <h1
          className="font-extrabold leading-[0.95] tracking-[-0.04em]"
          style={{ fontSize: "clamp(44px,7vw,104px)" }}
        >
          The Dispatch.
        </h1>
        <p className="mt-7 max-w-[600px] text-[19px] leading-normal text-ink/60">
          Monthly notes on digital organising, fundraising, and shipping software under a deadline
          that will not move.
        </p>
      </section>

      {/* Featured – the newest dispatch, full width between hairlines */}
      <section className="mx-auto max-w-[1360px] px-6 pb-14 lg:px-10">
        <Reveal>
          <Link
            href={`/dispatch/${featured.slug}`}
            className="group grid grid-cols-1 items-center gap-10 border-y border-hairline py-10 md:grid-cols-[1.1fr_1fr]"
          >
            <div>
              <div className="mb-4 font-mono text-xs tracking-[0.06em] text-vermilion">
                {featured.tag} · {featured.date} · {featured.readMins} MIN
              </div>
              <h2
                className="mb-[18px] font-extrabold leading-[1.1] tracking-[-0.025em]"
                style={{ fontSize: "clamp(28px,3.4vw,44px)" }}
              >
                {featured.title}
              </h2>
              <p className="mb-[22px] max-w-[520px] text-[17px] leading-[1.6] text-ink/65">
                {featured.excerpt}
              </p>
              <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
                Read the dispatch <span>→</span>
              </span>
            </div>
            <div className="overflow-hidden rounded-card">
              <MediaPlaceholder
                caption="[ FEATURED — ILLUSTRATION ]"
                ratio="4/3"
                className="transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
              />
            </div>
          </Link>
        </Reveal>
      </section>

      {/* Archive grid – the remaining dispatches, three across */}
      <section className="mx-auto max-w-[1360px] px-6 pb-30 lg:px-10">
        <div className="grid grid-cols-1 gap-x-8 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <Reveal key={p.slug}>
              <Link href={`/dispatch/${p.slug}`} className="group block">
                <div className="mb-5 overflow-hidden rounded-card">
                  <MediaPlaceholder
                    caption={`[ ${p.tag} — ILLUSTRATION ]`}
                    ratio="16/11"
                    className="transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
                  />
                </div>
                <div className="mb-2.5 font-mono text-[11px] tracking-[0.05em] text-vermilion">
                  {p.tag} · {p.date} · {p.readMins} MIN
                </div>
                <div className="mb-2.5 text-[20px] font-bold leading-[1.22] tracking-[-0.02em]">
                  {p.title}
                </div>
                <p className="text-[15px] leading-[1.55] text-ink/60">{p.excerpt}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
