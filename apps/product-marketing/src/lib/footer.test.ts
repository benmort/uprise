import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOOTER } from "./footer";

// FOOTER is the SITE-WIDE footer (MarketingChrome renders it on every route), so a
// mistake here is visible on every page and on none of them in particular – nothing
// about a broken footer link fails a build. These tests cover the two things that
// silently rot: a link pointing at a route that does not exist, and the deliberate
// wording decisions documented in footer.ts being "tidied" back by a later editor.

const APP_DIR = join(__dirname, "..", "app");

/**
 * Every route the App Router actually serves, derived from the `page.tsx` files on disk.
 * Route groups (`(resources)`) are path-invisible, so they are stripped – which is the
 * whole reason a footer href cannot be eyeballed against the directory tree.
 */
function routesOnDisk(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // A `(group)` contributes nothing to the URL; every other segment does.
      const segment = /^\(.*\)$/.test(entry.name) ? prefix : `${prefix}/${entry.name}`;
      out.push(...routesOnDisk(join(dir, entry.name), segment));
    } else if (entry.name === "page.tsx") {
      out.push(prefix === "" ? "/" : prefix);
    }
  }
  return out;
}

// FOOTER is `as const`, so `columns` is a tuple of differing literal shapes and nothing
// downstream infers. Widen it once, structurally, and every assertion below is typed.
type FooterLink = { label: string; href: string };
type FooterColumn = { heading: string; cols: number; links: readonly FooterLink[] };

const ROUTES = new Set(routesOnDisk(APP_DIR));
const COLUMNS = FOOTER.columns as readonly FooterColumn[];
const ALL_LINKS: FooterLink[] = COLUMNS.flatMap((c) => [...c.links]);

describe("FOOTER link integrity", () => {
  it("resolves every href to a route that exists on disk", () => {
    // Sanity-check the resolver itself before trusting its verdict – if the traversal
    // silently found nothing, every assertion below would pass vacuously.
    expect(ROUTES.has("/")).toBe(true);
    expect(ROUTES.size).toBeGreaterThan(10);

    const dead = ALL_LINKS.filter((l) => !ROUTES.has(l.href));
    expect(dead, `dead footer links: ${dead.map((l) => `${l.label} → ${l.href}`).join(", ")}`)
      .toEqual([]);
  });

  it("uses root-relative hrefs only", () => {
    // An absolute URL here would leave the site silently, and a bare `docs` would
    // resolve relative to whatever page the footer happens to be rendered on.
    for (const { label, href } of ALL_LINKS) {
      expect(href.startsWith("/"), `${label}: ${href}`).toBe(true);
      expect(href, label).not.toMatch(/^\/\//);
      expect(href, label).not.toMatch(/\/$/);
    }
  });

  it("lists no href or label twice", () => {
    const hrefs = ALL_LINKS.map((l) => l.href);
    const labels = ALL_LINKS.map((l) => l.label);
    expect(new Set(hrefs).size, "duplicate href").toBe(hrefs.length);
    expect(new Set(labels).size, "duplicate label").toBe(labels.length);
  });

  it("gives every column a heading and at least one link", () => {
    const headings = COLUMNS.map((c) => c.heading);
    expect(new Set(headings).size).toBe(headings.length);
    for (const column of COLUMNS) {
      expect(column.heading.trim(), "empty heading").not.toBe("");
      expect(column.links.length, `${column.heading} has no links`).toBeGreaterThan(0);
      for (const { label } of column.links) expect(label.trim()).not.toBe("");
    }
  });
});

describe("FOOTER documented decisions", () => {
  /**
   * footer.ts:19-22 – `cols: 2` exists because Resources carries roughly twice the links
   * of its neighbours and as one list left the footer ragged. Pin the *reason*, not the
   * literal 2: if a column grows past Resources, this fails and asks for a re-think
   * rather than quietly going ragged again.
   */
  it("flows only the longest column into two sub-columns", () => {
    const longest = Math.max(...COLUMNS.map((c) => c.links.length));
    for (const column of COLUMNS) {
      expect(column.cols, `${column.heading} (${column.links.length} links)`).toBe(
        column.links.length === longest ? 2 : 1,
      );
    }
  });

  /**
   * footer.ts:12-17 – the badge previously read "AEC Approved", which is not a thing: the
   * AEC is a *data source* for this platform, not an accreditor of campaigning software,
   * so the claim was unfounded. It now states independence instead. Regression-guard it,
   * because "Approved" is exactly the sort of word that reads as an upgrade.
   */
  it("states independence rather than an accreditation it cannot claim", () => {
    expect(FOOTER.notice.title).toBe("Independent");
    const claim = `${FOOTER.notice.title} ${FOOTER.notice.body}`;
    expect(claim).not.toMatch(/\bAEC\b/i);
    expect(claim).not.toMatch(/approved|accredited|certified|endorsed/i);
  });

  /**
   * footer.ts:51-52 – in a one-word column the repeated "Policy" was the widest thing in
   * it and carried no information, so the labels were shortened while the destinations
   * kept their full headings. That is why `/privacy-policy` is labelled "Privacy".
   */
  it("keeps the Policies labels short even where the route name is not", () => {
    const policies = COLUMNS.find((c) => c.heading === "Policies");
    expect(policies, "the Policies column was renamed or removed").toBeDefined();
    for (const { label } of policies!.links) {
      expect(label, `${label} re-lengthened`).not.toMatch(/\bPolicy\b/);
    }
    // The shortening is a label-only change – the routes still carry their full names.
    expect(policies!.links.map((l) => l.href)).toContain("/privacy-policy");
    expect(policies!.links.map((l) => l.href)).toContain("/donations-policy");
  });

  it("keeps the acknowledgement of country intact", () => {
    // Deliberate wording, not boilerplate to be trimmed to fit a layout.
    expect(FOOTER.acknowledgement).toMatch(/sovereignty was never ceded/i);
    expect(FOOTER.acknowledgement).toMatch(/traditional owners/i);
  });
});
