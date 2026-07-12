import { describe, it, expect } from "vitest";
import { hexToHslChannels, brandVarsCss, sanitizeBrandCss } from "./brand-css";

describe("hexToHslChannels", () => {
  it("converts 6-digit hex to DS HSL channels", () => {
    expect(hexToHslChannels("#465fff")).toBe("232 100% 64%");
    expect(hexToHslChannels("#ffffff")).toBe("0 0% 100%");
    expect(hexToHslChannels("#000000")).toBe("0 0% 0%");
    expect(hexToHslChannels("#ff0000")).toBe("0 100% 50%");
  });

  it("expands 3-digit shorthand", () => {
    expect(hexToHslChannels("#fff")).toBe("0 0% 100%");
    expect(hexToHslChannels("f00")).toBe("0 100% 50%");
  });

  it("returns null for anything that isn't a hex", () => {
    expect(hexToHslChannels("rebeccapurple")).toBeNull();
    expect(hexToHslChannels("rgb(1,2,3)")).toBeNull();
    expect(hexToHslChannels("var(--x)")).toBeNull();
    expect(hexToHslChannels("#12")).toBeNull();
    expect(hexToHslChannels("")).toBeNull();
  });
});

describe("brandVarsCss", () => {
  it("maps a hex primary onto --primary channels AND exposes the raw hex", () => {
    const css = brandVarsCss({ primaryColour: "#465fff", secondaryColour: "#123456" });
    expect(css).toContain("--brand-primary: #465fff;");
    expect(css).toContain("--primary: 232 100% 64%;");
    expect(css).toContain("--brand-secondary: #123456;");
    expect(css.startsWith(":root{")).toBe(true);
  });

  it("exposes a non-hex primary as a var but does not override --primary channels", () => {
    const css = brandVarsCss({ primaryColour: "rebeccapurple" });
    expect(css).toContain("--brand-primary: rebeccapurple;");
    expect(css).not.toContain("--primary:");
  });

  it("returns empty string when nothing is set", () => {
    expect(brandVarsCss({})).toBe("");
    expect(brandVarsCss({ primaryColour: "", secondaryColour: null })).toBe("");
  });
});

describe("sanitizeBrandCss — adversarial", () => {
  it("kills the </style> breakout (strips all <)", () => {
    const out = sanitizeBrandCss("a{}</style><script>alert(1)</script>");
    expect(out).not.toContain("<");
    expect(out.toLowerCase()).not.toContain("</style>");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("keeps the > child combinator intact", () => {
    expect(sanitizeBrandCss(".a > .b{color:red}")).toContain(".a > .b");
  });

  it("strips @import (even comment-split evasions)", () => {
    expect(sanitizeBrandCss('@import "https://evil.example/x.css";').toLowerCase()).not.toContain("import");
    expect(sanitizeBrandCss('@im/**/port url(//evil);').toLowerCase()).not.toContain("import");
  });

  it("neutralises url() beacons — http, protocol-relative, and data:", () => {
    const out = sanitizeBrandCss(
      "body{background:url(http://evil/beacon.png)} a{list-style:url(//evil/x)} b{background:url(data:image/png;base64,AAAA)}",
    );
    expect(out.toLowerCase()).not.toContain("url(");
    expect(out).not.toContain("evil");
  });

  it("strips expression(), -moz-binding, behavior and script schemes", () => {
    const out = sanitizeBrandCss(
      "a{width:expression(alert(1));-moz-binding:url(x.xml#e);behavior:url(x.htc);background:javascript:alert(1);cursor:vbscript:foo}",
    );
    const low = out.toLowerCase();
    expect(low).not.toContain("expression(");
    expect(low).not.toContain("-moz-binding");
    expect(low).not.toContain("behavior");
    expect(low).not.toContain("javascript:");
    expect(low).not.toContain("vbscript:");
  });

  it("passes through safe declarative CSS", () => {
    const safe = ".tenant-brand h1{color:#465fff;font-weight:800}";
    expect(sanitizeBrandCss(safe)).toBe(safe);
  });

  it("handles empty / null / undefined", () => {
    expect(sanitizeBrandCss(null)).toBe("");
    expect(sanitizeBrandCss(undefined)).toBe("");
    expect(sanitizeBrandCss("")).toBe("");
  });
});
