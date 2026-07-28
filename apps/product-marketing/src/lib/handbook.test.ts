import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  HANDBOOK_SECTIONS,
  getAllHandbookDocs,
  getHandbookDoc,
  handbookNavigation,
} from "./handbook";

const HANDBOOK_DIR = path.join(process.cwd(), "docs", "handbook");

describe("handbook registry", () => {
  it("exposes both tracks with docs in each", () => {
    expect(HANDBOOK_SECTIONS.map((s) => s.title)).toEqual(["Scenarios", "Managing"]);
    for (const section of HANDBOOK_SECTIONS) {
      expect(section.docs.length).toBeGreaterThan(0);
      expect(section.blurb).not.toHaveLength(0);
    }
  });

  it("flattens every doc, with unique slugs", () => {
    const docs = getAllHandbookDocs();
    const slugs = docs.map((d) => d.slug);
    expect(docs).toHaveLength(HANDBOOK_SECTIONS.reduce((n, s) => n + s.docs.length, 0));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every doc a title and a description", () => {
    for (const doc of getAllHandbookDocs()) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.description.length).toBeGreaterThan(0);
      expect(doc.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("resolves a known slug and rejects an unknown one", () => {
    expect(getHandbookDoc("reading-your-results")?.title).toBe("Reading your results");
    expect(getHandbookDoc("no-such-page")).toBeUndefined();
    expect(getHandbookDoc("")).toBeUndefined();
  });

  // The registry is the only list of pages; a slug with no markdown behind it would build fine
  // and 404 at runtime, so the file's existence is asserted here rather than discovered later.
  it("has a markdown file on disk for every registered slug", () => {
    for (const doc of getAllHandbookDocs()) {
      const file = path.join(HANDBOOK_DIR, `${doc.slug}.md`);
      expect(fs.existsSync(file), `missing ${file}`).toBe(true);
    }
  });

  it("registers every markdown file on disk (no orphaned pages)", () => {
    const onDisk = fs
      .readdirSync(HANDBOOK_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    expect(onDisk).toEqual(getAllHandbookDocs().map((d) => d.slug).sort());
  });

  // Cross-links are written by hand in the markdown, so a typo would ship a dead link.
  it("only links to /docs pages that exist", () => {
    const slugs = new Set(getAllHandbookDocs().map((d) => d.slug));
    for (const doc of getAllHandbookDocs()) {
      const body = fs.readFileSync(path.join(HANDBOOK_DIR, `${doc.slug}.md`), "utf8");
      for (const [, target] of body.matchAll(/\]\(\/docs\/([a-z0-9-]+)\)/g)) {
        expect(slugs.has(target), `${doc.slug}.md links to missing /docs/${target}`).toBe(true);
      }
    }
  });
});

// The blog articles link into the handbook by hand-written path. A renamed or deleted page would
// leave dead "Read more" links in published content, which nothing else would catch.
describe("blog cross-links into the handbook", () => {
  it("only links to /docs pages that exist", () => {
    const slugs = new Set(getAllHandbookDocs().map((d) => d.slug));
    const posts = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src", "content", "blog", "posts.json"), "utf8"),
    ) as Array<{ slug: string; body: string }>;
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      for (const [, target] of post.body.matchAll(/\]\(\/docs\/([a-z0-9-]+)\)/g)) {
        expect(slugs.has(target), `blog post ${post.slug} links to missing /docs/${target}`).toBe(true);
      }
    }
  });

  it("gives every article at least one handbook link", () => {
    const posts = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src", "content", "blog", "posts.json"), "utf8"),
    ) as Array<{ slug: string; body: string }>;
    for (const post of posts) {
      expect([...post.body.matchAll(/\]\(\/docs\//g)].length, `${post.slug} has no handbook links`)
        .toBeGreaterThan(0);
    }
  });

  // Body images are referenced from markdown, so a missing file is a broken image at runtime.
  it("references body images that exist on disk", () => {
    const posts = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src", "content", "blog", "posts.json"), "utf8"),
    ) as Array<{ slug: string; body: string }>;
    for (const post of posts) {
      const images = [...post.body.matchAll(/!\[[^\]]*\]\((\/images\/[^\s)"]+)/g)];
      expect(images.length, `${post.slug} has no body image`).toBeGreaterThan(0);
      for (const [, src] of images) {
        expect(fs.existsSync(path.join(process.cwd(), "public", src)), `missing ${src}`).toBe(true);
      }
    }
  });
});

describe("handbookNavigation", () => {
  it("pins the overview first, then one group per section", () => {
    const nav = handbookNavigation();
    expect(nav[0]).toEqual({
      title: "Handbook",
      href: "#handbook",
      children: [{ title: "Overview", href: "/docs" }],
    });
    expect(nav.slice(1).map((g) => g.title)).toEqual(["Scenarios", "Managing"]);
  });

  it("points every child at its own /docs route", () => {
    const children = handbookNavigation().slice(1).flatMap((g) => g.children);
    expect(children).toHaveLength(getAllHandbookDocs().length);
    for (const child of children) {
      expect(child.href).toMatch(/^\/docs\/[a-z0-9-]+$/);
    }
  });
});
