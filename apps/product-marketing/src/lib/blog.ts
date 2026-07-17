import postsData from "@/content/blog/posts.json";

export type BlogCoverTone = "blue" | "violet" | "pink" | "green" | "amber" | "cyan";

export interface BlogAuthor {
  name: string;
  role: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: BlogAuthor;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  /** e.g. "6 min read". */
  readingTime: string;
  coverTone: BlogCoverTone;
  tags: string[];
  /** Markdown body, rendered via MarkdownRenderer. */
  body: string;
}

const posts = postsData as BlogPost[];

/** All posts, newest first. */
export function getAllPosts(): BlogPost[] {
  return [...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

/** Other posts in the same category, newest first. */
export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  return getAllPosts()
    .filter((p) => p.slug !== post.slug && p.category === post.category)
    .slice(0, limit);
}

export function getCategories(): string[] {
  return Array.from(new Set(getAllPosts().map((p) => p.category)));
}

/** Human date, e.g. "17 July 2026" (Australian English). */
export function formatPostDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
