import { describe, expect, it } from "vitest";
import { qrSvg, qrFilename } from "./qr";

describe("qrSvg", () => {
  it("renders scalable SVG markup for a value", async () => {
    const svg = await qrSvg("https://act.test/events/e1");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });
});

describe("qrFilename", () => {
  it("derives host + first path segment", () => {
    expect(qrFilename("https://act.test/events/e1", "png")).toBe("act-test-events.png");
    expect(qrFilename("https://act.test/", "svg")).toBe("act-test.svg");
  });
  it("slugs a non-URL and falls back", () => {
    expect(qrFilename("Join us!", "png")).toBe("join-us.png");
    expect(qrFilename("", "svg")).toBe("qr-code.svg");
  });
});
