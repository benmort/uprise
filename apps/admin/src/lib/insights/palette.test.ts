import { describe, expect, it } from "vitest";
import { buildPollPalette, contrastRatio, hslToHex, parseHslTriple, POLL_TOKENS, readableOn } from "./palette";

/**
 * The tokens exactly as `packages/ui/globals.css` declares them. These doubles are the
 * point of the test: the hexes on the right are the ones the dataviz validator passed,
 * so if the conversion or a token value drifts, the palette that ships to ApexCharts
 * stops being the palette that was checked for colour-blind separation and contrast.
 */
const LIGHT: Record<string, string> = {
  "--poll-support-strong": "237.6 69% 50.6%",
  "--poll-support-soft": "233.1 100% 71%",
  "--poll-neutral": "240 5.9% 90%",
  "--poll-oppose-soft": "9.6 79.4% 60%",
  "--poll-oppose-strong": "8.4 74.8% 45.1%",
  "--poll-seq-1": "212.6 76.6% 73.1%",
  "--poll-seq-2": "212.5 75.3% 62%",
  "--poll-seq-3": "212.8 67.7% 50.2%",
  "--poll-seq-4": "213.1 71.9% 39%",
  "--poll-seq-5": "213.5 77.9% 28.4%",
  "--poll-accent": "8.4 74.8% 45.1%",
  "--poll-nodata": "240 5.9% 90%",
  "--foreground": "240 10% 3.9%",
  "--muted-foreground": "240 4% 46%",
  "--border": "240 6% 90%",
  "--surface": "0 0% 100%",
};

const DARK: Record<string, string> = {
  "--poll-support-strong": "233.3 100% 77.1%",
  "--poll-support-soft": "232.9 62.2% 57.5%",
  "--poll-neutral": "240 5.3% 26.1%",
  "--poll-oppose-soft": "10.7 58.8% 44.7%",
  "--poll-oppose-strong": "10.6 85% 58.2%",
  "--poll-seq-1": "213.1 67.5% 44.7%",
  "--poll-seq-2": "212.8 76.8% 56.1%",
  "--poll-seq-3": "212.6 77% 67.6%",
  "--poll-seq-4": "212.8 79.6% 78.8%",
  "--poll-seq-5": "212.6 85.2% 89.4%",
  "--poll-accent": "10.6 85% 58.2%",
  "--poll-nodata": "240 5.3% 26.1%",
  "--foreground": "0 0% 98%",
  "--muted-foreground": "240 5% 65%",
  "--border": "240 4% 18%",
  "--surface": "240 6% 10%",
};

const readerFor = (tokens: Record<string, string>) => (name: string) => tokens[name] ?? "";

describe("parseHslTriple", () => {
  it("reads Tailwind's channel-triple form", () => {
    expect(parseHslTriple("237.6 69% 50.6%")).toEqual({ h: 237.6, s: 69, l: 50.6 });
  });

  it("tolerates surrounding whitespace and a deg suffix", () => {
    expect(parseHslTriple("  240deg 5.9% 90%  ")).toEqual({ h: 240, s: 5.9, l: 90 });
  });

  it.each([
    ["", "an unresolved token"],
    ["#2a31d8", "a hex value"],
    ["237.6 69 50.6", "missing percent signs"],
    ["hsl(237.6 69% 50.6%)", "a wrapped colour"],
    ["a b% c%", "non-numeric channels"],
  ])("returns null for %s (%s)", (input) => {
    expect(parseHslTriple(input)).toBeNull();
  });
});

describe("hslToHex", () => {
  /**
   * Each of these is a token that was run through the dataviz validator. If one changes,
   * the shipped chart colour no longer matches what was checked.
   */
  it.each([
    ["237.6 69% 50.6%", "#2a31d8", "diverging support pole (light)"],
    ["240 5.9% 90%", "#e4e4e7", "diverging neutral midpoint (light)"],
    ["8.4 74.8% 45.1%", "#c9351d", "diverging oppose pole (light)"],
    ["233.3 100% 77.1%", "#8a97ff", "diverging support pole (dark)"],
    ["212.6 76.6% 73.1%", "#86b6ef", "sequential low (light)"],
    ["213.5 77.9% 28.4%", "#104281", "sequential high (light)"],
    ["213.1 67.5% 44.7%", "#256abf", "sequential low (dark)"],
    ["212.6 85.2% 89.4%", "#cde2fb", "sequential high (dark)"],
  ])("converts %s to %s — %s", (triple, hex) => {
    expect(hslToHex(parseHslTriple(triple)!)).toBe(hex);
  });

  it("emits a 6-digit lower-case hex, zero-padded", () => {
    expect(hslToHex({ h: 0, s: 0, l: 0 })).toBe("#000000");
    expect(hslToHex({ h: 0, s: 0, l: 100 })).toBe("#ffffff");
  });

  it("clamps out-of-gamut channels rather than emitting NaN", () => {
    expect(hslToHex({ h: 0, s: 500, l: -20 })).toBe("#000000");
    expect(hslToHex({ h: 0, s: -5, l: 140 })).toBe("#ffffff");
  });
});

describe("contrastRatio", () => {
  it("spans the WCAG range and is symmetric", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("readableOn", () => {
  const INK_LIGHT = "#09090b";
  const SURFACE_LIGHT = "#ffffff";
  const INK_DARK = "#fafafa";
  const SURFACE_DARK = "#18181b";

  it("picks dark ink on the light theme's pale steps and light ink on its dark steps", () => {
    expect(readableOn("#86b6ef", INK_LIGHT, SURFACE_LIGHT)).toBe(INK_LIGHT); // seq-1
    expect(readableOn("#104281", INK_LIGHT, SURFACE_LIGHT)).toBe(SURFACE_LIGHT); // seq-5
  });

  it("flips correctly for the dark theme, whose ramp runs the other way", () => {
    expect(readableOn("#256abf", INK_DARK, SURFACE_DARK)).toBe(INK_DARK); // seq-1, dark
    expect(readableOn("#cde2fb", INK_DARK, SURFACE_DARK)).toBe(SURFACE_DARK); // seq-5, bright
  });

  it("fixes the mid-step that an index-based rule got wrong", () => {
    // `#6da7ec` is dark-theme seq-3. Keyed on its index it took white ink at 2.4:1;
    // measured, it takes the dark surface instead.
    const chosen = readableOn("#6da7ec", INK_DARK, SURFACE_DARK);
    expect(chosen).toBe(SURFACE_DARK);
    expect(contrastRatio("#6da7ec", chosen)).toBeGreaterThan(4.5);
  });

  it("clears 4.5:1 on every step of both sequential ramps", () => {
    const light = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
    const dark = ["#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"];
    for (const step of light) {
      expect(contrastRatio(step, readableOn(step, INK_LIGHT, SURFACE_LIGHT))).toBeGreaterThanOrEqual(4.5);
    }
    for (const step of dark) {
      expect(contrastRatio(step, readableOn(step, INK_DARK, SURFACE_DARK))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("buildPollPalette", () => {
  it("resolves the light theme's tokens to the validated hexes", () => {
    const p = buildPollPalette(readerFor(LIGHT));

    expect(p.diverging).toEqual(["#2a31d8", "#6b7cff", "#e4e4e7", "#ea6248", "#c9351d"]);
    expect(p.seq).toEqual(["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"]);
    expect(p.surface).toBe("#ffffff");
    expect(p.accent).toBe("#c9351d");
  });

  it("resolves the dark theme separately — the poles brighten, the surface darkens", () => {
    const p = buildPollPalette(readerFor(DARK));

    expect(p.diverging[0]).toBe("#8a97ff"); // support pole, brighter than light's #2a31d8
    expect(p.seq[0]).toBe("#256abf");
    expect(p.seq[4]).toBe("#cde2fb"); // high end is the bright one on a dark surface
    expect(p.surface).toBe("#18181b");
  });

  it("re-skins every token in dark, so no chart colour silently falls back to light", () => {
    const light = buildPollPalette(readerFor(LIGHT));
    const dark = buildPollPalette(readerFor(DARK));

    // `.dark` in globals.css overrides all of these; a shared value would mean the
    // token was dropped from the dark block and the chart is painting the light hue.
    expect(dark.diverging).not.toEqual(light.diverging);
    expect(dark.seq).not.toEqual(light.seq);
    for (const key of ["accent", "nodata", "ink", "muted", "grid", "surface"] as const) {
      expect(dark[key], `${key} is identical in both themes`).not.toBe(light[key]);
    }
  });

  it("keeps the diverging ramp in slot order, strongly-positive first", () => {
    const p = buildPollPalette(readerFor(LIGHT));
    expect(p.diverging[0]).toBe(hslToHex(parseHslTriple(LIGHT["--poll-support-strong"])!));
    expect(p.diverging[4]).toBe(hslToHex(parseHslTriple(LIGHT["--poll-oppose-strong"])!));
  });

  it("keeps the sequential ramp low → high", () => {
    const p = buildPollPalette(readerFor(LIGHT));
    expect(p.seq[0]).toBe(hslToHex(parseHslTriple(LIGHT["--poll-seq-1"])!));
    expect(p.seq[4]).toBe(hslToHex(parseHslTriple(LIGHT["--poll-seq-5"])!));
  });

  it("falls back to a readable colour when a token is missing, never NaN", () => {
    const p = buildPollPalette(() => "");

    expect(p.diverging).toEqual(["#2a31d8", "#6b7cff", "#e4e4e7", "#ea6248", "#c9351d"]);
    expect(p.seq[0]).toBe("#86b6ef");
    expect(Object.values(p).flat().join()).not.toContain("NaN");
  });

  it("falls back per-token, so one bad value does not poison the palette", () => {
    const p = buildPollPalette(readerFor({ ...LIGHT, "--poll-neutral": "garbage" }));

    expect(p.diverging[2]).toBe("#e4e4e7"); // the fallback
    expect(p.diverging[0]).toBe("#2a31d8"); // its neighbours still resolve
  });

  it("names every token it reads, so a rename in globals.css is caught here", () => {
    const seen = new Set<string>();
    buildPollPalette((name) => {
      seen.add(name);
      return LIGHT[name] ?? "";
    });

    const expected = [
      ...POLL_TOKENS.diverging,
      ...POLL_TOKENS.seq,
      POLL_TOKENS.accent,
      POLL_TOKENS.nodata,
      POLL_TOKENS.ink,
      POLL_TOKENS.muted,
      POLL_TOKENS.grid,
      POLL_TOKENS.surface,
    ];
    expect([...seen].sort()).toEqual([...new Set(expected)].sort());
    // Every token the palette reads must actually exist in globals.css.
    for (const t of expected) expect(LIGHT[t], `${t} missing from the token fixture`).toBeDefined();
  });
});
