import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders status text", () => {
    const html = renderToStaticMarkup(<StatusBadge status="SENT" />);
    expect(html).toContain("Sent");
    expect(html).toContain("bg-success-container");
  });

  // OPTIONAL is the settings cards' chip (FormSectionCard). It must be a MAPPED status, not fall
  // through to the generic bg-secondary default, or it'd be indistinguishable from a typo'd status.
  it("maps OPTIONAL to the muted tone", () => {
    const html = renderToStaticMarkup(<StatusBadge status="OPTIONAL" />);
    expect(html).toContain("Optional");
    expect(html).toContain("bg-surface-variant");
    expect(html).not.toContain("bg-secondary ");
  });
});
