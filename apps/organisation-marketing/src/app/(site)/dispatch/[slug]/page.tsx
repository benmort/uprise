import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaPlaceholder } from "@/components/system/MediaPlaceholder";
import { Reveal } from "@/components/system/Reveal";
import { POSTS, getPost } from "@/lib/data/posts";
import type { PostBlock } from "@/lib/data/types";

/**
 * Dispatch post template – the prototype's pPost view. One route per post;
 * every content string renders from POSTS so the content pass edits data,
 * not markup.
 */

const CONTAINER = "mx-auto max-w-[1360px] px-6 lg:px-10";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

/** Render one article block – paragraph, subhead or pull quote. */
function ArticleBlock({ block }: { block: PostBlock }) {
  switch (block.type) {
    case "h2":
      return (
        <h2 className="pt-4 text-[26px] font-extrabold leading-[1.2] tracking-[-0.02em]">
          {block.text}
        </h2>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-vermilion pl-6 text-[21px] font-medium leading-[1.4]">
          {block.text}
        </blockquote>
      );
    default:
      return <p className="text-[18px] leading-[1.72] text-ink/80">{block.text}</p>;
  }
}

export default function DispatchPostPage({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();

  // The three most recent other posts for the keep-reading rail.
  const others = POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <div className="pt-40">
      {/* Back link, meta, title and author row */}
      <section className="mx-auto max-w-[820px] px-6 lg:px-10">
        <Link
          href="/dispatch"
          className="inline-flex items-center gap-2 font-mono text-[13px] font-medium text-ink/55 transition-colors hover:text-vermilion"
        >
          <span aria-hidden>←</span> ALL DISPATCHES
        </Link>
        <div className="mb-[18px] mt-9 font-mono text-xs font-medium tracking-[0.06em] text-vermilion">
          {post.tag} · {post.date} · {post.readMins} MIN READ
        </div>
        <h1
          className="font-extrabold leading-[1.04] tracking-[-0.03em]"
          style={{ fontSize: "clamp(32px,4.4vw,60px)" }}
        >
          {post.title}
        </h1>
        <div className="mt-8 flex items-center gap-3">
          <div className="stripe-placeholder h-10 w-10 rounded-full" aria-hidden />
          <div>
            <div className="text-sm font-semibold">{post.author.name}</div>
            <div className="font-mono text-[11px] font-medium text-ink/55">{post.author.role}</div>
          </div>
        </div>
      </section>

      {/* Hero image slot */}
      <section className="mx-auto max-w-[1160px] px-6 py-12 lg:px-10">
        <MediaPlaceholder caption="[ HERO — ILLUSTRATION ]" ratio="16/7" />
      </section>

      {/* Article body */}
      <article className="mx-auto max-w-[720px] space-y-6 px-6 pb-[60px] pt-5 lg:px-10">
        {post.body.map((block, i) => (
          <ArticleBlock key={`${block.type}-${i}`} block={block} />
        ))}
      </article>

      {/* Keep reading – three other dispatches, same card as the index grid */}
      <section className={`${CONTAINER} pb-30 pt-10`}>
        <Reveal>
          <div className="border-t border-hairline pt-10">
            <div className="mb-7 font-mono text-xs font-medium tracking-[0.08em] text-vermilion">
              KEEP READING
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {others.map((p) => (
                <Link key={p.slug} href={`/dispatch/${p.slug}`} className="group block">
                  <MediaPlaceholder
                    caption={`[ ${p.tag} — ILLUSTRATION ]`}
                    ratio="16/11"
                    className="mb-5"
                  />
                  <div className="mb-2.5 font-mono text-[11px] font-medium tracking-[0.05em] text-vermilion">
                    {p.tag} · {p.date} · {p.readMins} MIN
                  </div>
                  <div className="mb-2.5 text-[21px] font-semibold leading-[1.22] tracking-[-0.02em] transition-colors group-hover:text-vermilion">
                    {p.title}
                  </div>
                  <p className="text-[15px] leading-[1.55] text-ink/60">{p.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
