import { describe, it, expect } from "vitest";

import { CLIMATE_200_SLIDES, type TourSlide } from "./slides";

/** Every authored string on a slide, flattened — the copy rules apply to all of them. */
function stringsOf(slide: TourSlide): string[] {
  const out: string[] = [slide.eyebrow, slide.title];
  switch (slide.kind) {
    case "hero":
      out.push(slide.lede);
      break;
    case "chips":
      out.push(slide.note, ...slide.chips, ...slide.consequences);
      break;
    case "diagram":
      out.push(slide.hub.label, slide.hub.sublabel, ...slide.nodes.flatMap((n) => [n.label, ...n.items]));
      break;
    case "flow":
      out.push(slide.tagsLabel, ...slide.stages, ...slide.tags);
      break;
    case "checklist":
      out.push(slide.lede, slide.marker, ...slide.items);
      break;
    case "numbered":
      out.push(slide.outro, ...slide.questions);
      break;
    case "columns":
      out.push(...slide.columns.flatMap((c) => [c.heading, ...c.items]));
      break;
    case "compare":
      out.push(slide.leftLabel, slide.rightLabel, slide.note, ...slide.rows.flatMap((r) => [r.capability, r.left, r.right]));
      break;
    case "closing":
      out.push(slide.lede, ...slide.path);
      break;
  }
  return out;
}

const ALL_STRINGS = CLIMATE_200_SLIDES.flatMap(stringsOf);

describe("the Climate 200 deck", () => {
  it("is eleven slides with unique ids", () => {
    expect(CLIMATE_200_SLIDES).toHaveLength(11);
    const ids = CLIMATE_200_SLIDES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opens and closes on brand blue, and nothing in between", () => {
    // Blue is the statement tone: the opening claim and the closing ask. A blue slide in the
    // middle would flatten that into decoration.
    const blue = CLIMATE_200_SLIDES.map((s, i) => (s.tone === "blue" ? i : -1)).filter((i) => i >= 0);
    expect(blue).toEqual([0, CLIMATE_200_SLIDES.length - 1]);
    expect(CLIMATE_200_SLIDES[0].kind).toBe("hero");
    expect(CLIMATE_200_SLIDES.at(-1)?.kind).toBe("closing");
  });

  it("uses every layout kind once — except compare, which runs as a three-slide sequence", () => {
    const kinds = CLIMATE_200_SLIDES.map((s) => s.kind);
    const nonCompare = kinds.filter((k) => k !== "compare");
    expect(new Set(nonCompare).size).toBe(nonCompare.length);
    // The prior-art comparison is one argument spread over consecutive slides, so repetition
    // is the point there — but it stays contiguous, not scattered through the deck.
    const compareIdx = kinds.map((k, i) => (k === "compare" ? i : -1)).filter((i) => i >= 0);
    expect(compareIdx).toHaveLength(3);
    expect(compareIdx).toEqual([compareIdx[0], compareIdx[0] + 1, compareIdx[0] + 2]);
  });

  it("gives every slide an eyebrow and a title", () => {
    for (const slide of CLIMATE_200_SLIDES) {
      expect(slide.eyebrow.trim().length).toBeGreaterThan(0);
      expect(slide.title.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("per-layout shape", () => {
  it("draws the diagram with exactly three campaign nodes", () => {
    // The renderer positions the connector rail at fixed thirds (left/right 16.666%), so a
    // fourth node would draw a rail that stops short of it.
    const diagram = CLIMATE_200_SLIDES.find((s) => s.kind === "diagram");
    expect(diagram?.kind === "diagram" && diagram.nodes).toHaveLength(3);
    if (diagram?.kind === "diagram") {
      for (const node of diagram.nodes) expect(node.items.length).toBeGreaterThan(0);
    }
  });

  it("keeps the flow to six stages so it fits one line at 1280px", () => {
    const flow = CLIMATE_200_SLIDES.find((s) => s.kind === "flow");
    expect(flow?.kind === "flow" && flow.stages).toHaveLength(6);
  });

  it("asks exactly four questions, for a two-by-two grid", () => {
    const numbered = CLIMATE_200_SLIDES.find((s) => s.kind === "numbered");
    expect(numbered?.kind === "numbered" && numbered.questions).toHaveLength(4);
  });

  it("lays the pilot out in three columns, each with items", () => {
    const columns = CLIMATE_200_SLIDES.find((s) => s.kind === "columns");
    expect(columns?.kind === "columns" && columns.columns).toHaveLength(3);
    if (columns?.kind === "columns") {
      for (const col of columns.columns) expect(col.items.length).toBeGreaterThan(0);
    }
  });

  it("keeps every comparison row two-sided and short enough for a projector", () => {
    const compares = CLIMATE_200_SLIDES.filter((s) => s.kind === "compare");
    for (const slide of compares) {
      if (slide.kind !== "compare") continue;
      expect(slide.rows.length).toBeGreaterThanOrEqual(3);
      expect(slide.rows.length).toBeLessThanOrEqual(4);
      for (const row of slide.rows) {
        expect(row.left.trim().length).toBeGreaterThan(0);
        expect(row.right.trim().length).toBeGreaterThan(0);
      }
      // The evidence caveat / takeaway is a required part of the argument, not a caption.
      expect(slide.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("marks the scenario data as fictional", () => {
    // Showing invented supporters to a funder without saying so is the one thing on this slide
    // that could mislead, so the marker is a required field, not a nice-to-have.
    const checklist = CLIMATE_200_SLIDES.find((s) => s.kind === "checklist");
    expect(checklist?.kind === "checklist" && checklist.marker).toMatch(/fictional/i);
  });
});

describe("house copy rules", () => {
  it("never uses an em-dash", () => {
    // CLAUDE.md: spaced en-dashes only. An em-dash slipping into a partner deck is the kind of
    // detail that reads as sloppy on a projector.
    const offenders = ALL_STRINGS.filter((s) => s.includes("—"));
    expect(offenders).toEqual([]);
  });

  it("never uses an exclamation mark", () => {
    const offenders = ALL_STRINGS.filter((s) => s.includes("!"));
    expect(offenders).toEqual([]);
  });

  it("uses Australian spelling", () => {
    const offenders = ALL_STRINGS.filter((s) => /\b\w+iz(e|ing|ed|ation)\b|\bcolor\b|\bcenter\b/i.test(s));
    expect(offenders).toEqual([]);
  });

  it("never hard-codes a page number into the copy", () => {
    // Pagination is derived from array position at render time; a literal in the copy would
    // silently go stale the moment a slide is added or dropped.
    const offenders = ALL_STRINGS.filter((s) => /\b\d\s*\/\s*\d\b/.test(s));
    expect(offenders).toEqual([]);
  });
});
