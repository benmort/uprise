import { describe, expect, it } from "vitest";
import { callToAction, isQuoted } from "./plan-cta";

const plan = (key: string, displayName: string) => ({ key, displayName });

describe("isQuoted", () => {
  it("treats a missing price as quoted", () => {
    expect(isQuoted(null)).toBe(true);
    expect(isQuoted(undefined)).toBe(true);
  });

  it("treats a real price as listed", () => {
    expect(isQuoted(298)).toBe(false);
  });

  // Grassroots is priced null rather than 0 precisely so it takes the quoted branch. A $0
  // price would render "$0 / Choose Grassroots" and route to self-serve sign-up, which is
  // wrong for a licence that is assessed.
  it("treats zero as listed, not quoted", () => {
    expect(isQuoted(0)).toBe(false);
  });
});

describe("callToAction", () => {
  it("sends a quoted Grassroots to the application page", () => {
    expect(callToAction(plan("grassroots", "Grassroots"), true)).toEqual({
      heading: "Apply with us",
      label: "Apply with us",
      href: "/apply",
    });
  });

  it("sends any other quoted tier to the demo request", () => {
    expect(callToAction(plan("scale", "Scale"), true)).toEqual({
      heading: "Talk to us",
      label: "Talk to us",
      href: "/request-demo",
    });
  });

  it("sends a priced tier to self-serve sign-up", () => {
    expect(callToAction(plan("growth", "Growth"), false)).toEqual({
      heading: "",
      label: "Choose Growth",
      href: "/sign-up",
    });
  });

  // The Grassroots branch keys on the plan key, not on being quoted — so if Grassroots is ever
  // given a price it becomes self-serve rather than silently keeping the apply CTA.
  it("does not force the apply CTA on a priced Grassroots", () => {
    expect(callToAction(plan("grassroots", "Grassroots"), false).href).toBe("/sign-up");
  });
});
