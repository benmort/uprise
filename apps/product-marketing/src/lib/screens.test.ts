import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * The manifest is a real JSON file that starts out holding only a `_comment`, so these tests mock
 * the import to cover both the pre-capture and post-capture states without depending on whether
 * anyone has run the pipeline.
 */
const MANIFEST_PATH = "../../public/images/marketing/screens/screens.json";

async function withManifest(manifest: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock(MANIFEST_PATH, () => ({ default: manifest }));
  return import("./screens");
}

const good = {
  file: "/images/marketing/screens/inbox@2x.png",
  width: 3024,
  height: 1800,
  alt: "The Uprise shared team inbox",
};

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock(MANIFEST_PATH));

describe("screen()", () => {
  it("returns a complete entry", async () => {
    const { screen } = await withManifest({ inbox: good });
    expect(screen("inbox")).toEqual(good);
  });

  it("returns null for a key that hasn't been captured", async () => {
    const { screen } = await withManifest({ inbox: good });
    expect(screen("turf")).toBeNull();
  });

  it("ignores the manifest's leading _comment rather than treating it as a screenshot", async () => {
    const { screen } = await withManifest({ _comment: "written by pnpm marketing:shots" });
    expect(screen("_comment")).toBeNull();
  });

  it("rejects a half-written entry — a failed capture leaves null dimensions", async () => {
    const { screen } = await withManifest({
      a: { ...good, width: null },
      b: { ...good, height: 0 },
      c: { ...good, file: "" },
      d: { ...good, alt: "" },
      e: { file: good.file, width: good.width, height: good.height },
    });
    for (const k of ["a", "b", "c", "d", "e"]) expect(screen(k)).toBeNull();
  });

  it("survives a manifest that is empty or holds junk", async () => {
    const { screen } = await withManifest({ x: null, y: "nope", z: 7 });
    for (const k of ["x", "y", "z", "missing"]) expect(screen(k)).toBeNull();
  });
});

describe("hasScreen()", () => {
  it("gates an optional slot on a real capture existing", async () => {
    const { hasScreen } = await withManifest({ inbox: good, broken: { ...good, width: null } });
    expect(hasScreen("inbox")).toBe(true);
    expect(hasScreen("broken")).toBe(false);
    expect(hasScreen("absent")).toBe(false);
  });
});

describe("screenRatio()", () => {
  it("is the captured width over height, so a frame can size itself honestly", async () => {
    const { screenRatio } = await withManifest({ inbox: good });
    expect(screenRatio("inbox")).toBeCloseTo(3024 / 1800, 5);
  });

  it("is null when uncaptured", async () => {
    const { screenRatio } = await withManifest({});
    expect(screenRatio("inbox")).toBeNull();
  });
});
