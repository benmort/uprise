import React from "react";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import BlogCard from "@/components/marketing/BlogCard";
import SectionHeading from "@/components/marketing/SectionHeading";

/** Homepage strip — the three most recent blog posts, with a link through to the full index. */
export default function LatestBlog() {
  const posts = getAllPosts().slice(0, 3);
  if (posts.length === 0) return null;

  return (
    <section className="py-16 md:py-24 lg:py-30">
      <div className="container">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            align="left"
            eyebrow="From the blog"
            title="Latest from the blog"
            subtitle="Product deep-dives and campaigning playbooks."
          />
          <Link
            href="/blog"
            className="hidden shrink-0 text-sm font-semibold text-primary duration-200 hover:text-primary-600 sm:inline-flex"
          >
            View all posts →
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {posts.map((p) => (
            <BlogCard key={p.slug} post={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
