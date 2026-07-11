import { describe, expect, it } from "vitest";

import { getPost, POSTS } from "./posts";

describe("POSTS catalogue", () => {
  it("exposes a non-empty list of dispatch posts", () => {
    expect(POSTS.length).toBeGreaterThan(0);
  });

  it("has a unique slug for every post", () => {
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every post the required editorial fields", () => {
    for (const post of POSTS) {
      expect(post.slug).toMatch(/^[a-z0-9-]+$/);
      expect(post.title.length).toBeGreaterThan(0);
      expect(post.excerpt.length).toBeGreaterThan(0);
      expect(post.tag).toBe(post.tag.toUpperCase());
      expect(post.readMins).toBeGreaterThan(0);
      expect(Number.isInteger(post.readMins)).toBe(true);
      expect(post.author.name.length).toBeGreaterThan(0);
      expect(post.body.length).toBeGreaterThan(0);
    }
  });

  it("only uses the three known body block types", () => {
    const allowed = new Set(["p", "h2", "quote"]);
    for (const post of POSTS) {
      for (const block of post.body) {
        expect(allowed.has(block.type)).toBe(true);
        expect(block.text.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getPost", () => {
  it("returns the post whose slug matches", () => {
    const first = POSTS[0];
    const found = getPost(first.slug);
    expect(found).toBeDefined();
    expect(found).toBe(first);
    expect(found?.title).toBe(first.title);
  });

  it("resolves a known slug to the correct title", () => {
    const post = getPost("surviving-the-viral-moment");
    expect(post?.tag).toBe("ENGINEERING");
    expect(post?.readMins).toBe(9);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getPost("does-not-exist")).toBeUndefined();
  });

  it("is case-sensitive on the slug", () => {
    const first = POSTS[0];
    expect(getPost(first.slug.toUpperCase())).toBeUndefined();
  });
});
