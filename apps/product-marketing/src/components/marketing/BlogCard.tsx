import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatPostDate, type BlogPost } from "@/lib/blog";
import BlogCover from "./BlogCover";

/** Blog grid card — gradient cover, category badge, title, excerpt, author + date. */
export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stroke-secondary bg-white duration-200 hover:-translate-y-1 hover:border-primary-200 hover:shadow-feature"
    >
      <div className="aspect-[16/10] w-full overflow-hidden">
        <BlogCover tone={post.coverTone} category={post.category} />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-primary-25 px-3 py-1 text-xs font-semibold text-primary">
            {post.category}
          </span>
          <span className="text-xs text-text-color-tertiary">{post.readingTime}</span>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-title-color duration-200 group-hover:text-primary">
          {post.title}
        </h3>
        <p className="mb-5 line-clamp-2 text-sm !leading-normal text-text-color-secondary">{post.excerpt}</p>
        <div className="mt-auto flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-title-color">{post.author.name}</p>
            <p className="text-xs text-text-color-tertiary">{formatPostDate(post.date)}</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-50 text-text-color-secondary duration-200 group-hover:bg-primary group-hover:text-white">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
