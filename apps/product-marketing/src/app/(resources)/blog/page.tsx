import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAllPosts, formatPostDate } from "@/lib/blog";
import BlogCard from "@/components/marketing/BlogCard";
import BlogCover from "@/components/marketing/BlogCover";

export const metadata = {
  title: "Blog – Uprise",
  description: "Product deep-dives and campaigning playbooks from the Uprise team.",
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <main className="pt-28 md:pt-32">
      <div className="container py-16 md:py-24 lg:py-30">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            Uprise blog
          </span>
          <h1 className="mt-3 text-3xl font-bold !leading-[1.15] text-title-color md:text-[40px]">
            Ideas for people-powered campaigns
          </h1>
          <p className="mt-5 text-base !leading-relaxed text-text-color-secondary md:text-lg">
            Product deep-dives and campaigning playbooks from the Uprise team – built for
            organisers who move people to act.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="mt-16 rounded-2xl border border-stroke-secondary bg-white py-20 text-center">
            <p className="text-lg font-semibold text-title-color">No posts yet</p>
            <p className="mt-2 text-sm text-text-color-secondary">
              Check back soon – we&rsquo;re writing.
            </p>
          </div>
        ) : (
          <>
            <Link
              href={`/blog/${posts[0].slug}`}
              className="group mt-14 grid grid-cols-1 overflow-hidden rounded-2xl border border-stroke-secondary bg-white duration-200 hover:border-primary-200 hover:shadow-feature md:grid-cols-2"
            >
              <div className="min-h-[260px] overflow-hidden rounded-2xl md:h-full">
                <BlogCover tone={posts[0].coverTone} category={posts[0].category} />
              </div>
              <div className="flex flex-col justify-center p-8 md:p-10">
                <div className="mb-4 flex items-center gap-2">
                  <span className="rounded-full bg-primary-25 px-3 py-1 text-xs font-semibold text-primary">
                    {posts[0].category}
                  </span>
                  <span className="text-xs text-text-color-tertiary">
                    {posts[0].readingTime}
                  </span>
                </div>
                <h2 className="text-2xl font-bold !leading-[1.2] text-title-color duration-200 group-hover:text-primary md:text-3xl">
                  {posts[0].title}
                </h2>
                <p className="mt-4 text-base !leading-relaxed text-text-color-secondary">
                  {posts[0].excerpt}
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div>
                    <p className="text-sm font-medium text-title-color">
                      {posts[0].author.name}
                    </p>
                    <p className="text-xs text-text-color-tertiary">
                      {formatPostDate(posts[0].date)}
                    </p>
                  </div>
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Read article
                  <ArrowRight className="h-4 w-4 duration-200 group-hover:translate-x-1" />
                </span>
              </div>
            </Link>

            {posts.length > 1 && (
              <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {posts.slice(1).map((p) => (
                  <BlogCard key={p.slug} post={p} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
