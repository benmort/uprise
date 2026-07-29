import React from "react";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import BlogCover from "@/components/marketing/BlogCover";
import RevealScope from "./RevealScope";
import { cssVars } from "./parts";
import { BLOG } from "./sections";

/**
 * "From the blog" — the homepage2 candidate's posts grid, adopted for the live homepage in place of
 * the old <LatestBlog /> strip so the section sits in this page's language (mono eyebrow, ink
 * heading, hover-lift cards) rather than the shared design-system one.
 *
 * The one thing NOT carried over from that candidate: its posts were hardcoded in content.ts with
 * placeholder gradient thumbnails. These are the three most recent real posts, each with its own
 * BlogCover — a live homepage should never show invented articles.
 *
 * Renders nothing at all when there are no posts, rather than an empty grid.
 */
export default function LatestPosts() {
  const posts = getAllPosts().slice(0, 3);
  if (posts.length === 0) return null;

  return (
    <RevealScope className="hp4-blog">
      <div className="hp4-shell">
        <div className="hp4-bloghead hp4-rise">
          <div className="hp4-sechead">
            <span className="hp4-mono hp4-eyebrow">{BLOG.eyebrow}</span>
            <h2 className="hp4-h2">{BLOG.title}</h2>
          </div>
          <Link href="/blog" className="hp4-viewall">
            View all posts →
          </Link>
        </div>

        <div className="hp4-posts">
          {posts.map((post, i) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="hp4-post hp4-rise"
              style={cssVars({ "--d": `${i * 80}ms` })}
            >
              <span className="thumb">
                <BlogCover tone={post.coverTone} category={post.category} />
              </span>
              <span className="meta">
                <span className="hp4-mono cat">{post.category}</span>
                <span className="hp4-mono">{post.readingTime}</span>
              </span>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
            </Link>
          ))}
        </div>
      </div>
    </RevealScope>
  );
}
