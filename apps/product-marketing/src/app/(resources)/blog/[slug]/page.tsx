import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAllPosts, getPostBySlug, getRelatedPosts, formatPostDate } from "@/lib/blog";
import BlogCover from "@/components/marketing/BlogCover";
import BlogCard from "@/components/marketing/BlogCard";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  if (!post) return {};
  return { title: `${post.title} – Uprise`, description: post.excerpt };
}

export default function Post({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  const related = getRelatedPosts(post);

  return (
    <main className="pt-28 md:pt-32">
      <div className="container">
        <div className="mx-auto max-w-[820px]">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-text-color-secondary duration-200 hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to blog
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-primary-25 px-3 py-1 text-xs font-semibold text-primary">
              {post.category}
            </span>
            <span className="text-sm text-text-color-tertiary">{post.readingTime}</span>
            <span className="text-sm text-text-color-tertiary">{formatPostDate(post.date)}</span>
          </div>

          <h1 className="mt-4 text-3xl font-bold !leading-[1.15] text-title-color md:text-title-md">
            {post.title}
          </h1>

          <p className="mt-4 text-sm text-text-color-secondary">
            {post.author.name} – {post.author.role}
          </p>

          <div className="mt-8 aspect-[16/7] overflow-hidden rounded-2xl">
            <BlogCover tone={post.coverTone} category={post.category} title={post.title} size="hero" />
          </div>

          <MarkdownRenderer content={post.body} className="mt-10" />

          {post.tags.length > 0 && (
            <div className="mt-10 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-text-color-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {related.length > 0 && (
          <div className="mx-auto mt-16 max-w-[1200px] border-t border-stroke-secondary pt-16 md:mt-24 md:pt-24">
            <h2 className="text-2xl font-bold text-title-color">Related posts</h2>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {related.map((r) => (
                <BlogCard key={r.slug} post={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
