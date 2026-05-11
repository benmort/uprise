import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it("returns default button classes", () => {
    const classes = buttonVariants({ variant: "default", size: "default" });
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-11");
  });

  it("returns outline icon classes", () => {
    const classes = buttonVariants({ variant: "outline", size: "icon" });
    expect(classes).toContain("border");
    expect(classes).toContain("w-11");
  });
});
