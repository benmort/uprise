import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders status text", () => {
    const html = renderToStaticMarkup(<StatusBadge status="SENT" />);
    expect(html).toContain("SENT");
    expect(html).toContain("bg-success");
  });
});
