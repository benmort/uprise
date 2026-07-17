import { describe, expect, it } from "vitest";
import { readableOn } from "./readable-on";
import { icsContent, icsDataUrl, googleCalendarUrl } from "./calendar-links";

describe("readableOn", () => {
  it("picks dark ink on light backgrounds, white on dark", () => {
    expect(readableOn("#ffffff")).toBe("#111827");
    expect(readableOn("#fff")).toBe("#111827");
    expect(readableOn("#111111")).toBe("#ffffff");
    expect(readableOn("#465fff")).toBe("#ffffff");
  });
  it("returns undefined for a non-hex value", () => {
    expect(readableOn(null)).toBeUndefined();
    expect(readableOn("rebeccapurple")).toBeUndefined();
    expect(readableOn("")).toBeUndefined();
  });
});

describe("calendar links", () => {
  const event = {
    title: "Community BBQ, Fitzroy",
    description: "Come along",
    location: "Edinburgh Gardens",
    startsAt: "2030-01-02T01:00:00.000Z",
    endsAt: "2030-01-02T03:00:00.000Z",
    url: "https://act.test/events/e1",
  };

  it("builds a VEVENT with escaped, UTC-stamped fields", () => {
    const ics = icsContent(event);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20300102T010000Z");
    expect(ics).toContain("DTEND:20300102T030000Z");
    expect(ics).toContain("SUMMARY:Community BBQ\\, Fitzroy"); // comma escaped
    expect(ics).toContain("LOCATION:Edinburgh Gardens");
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
  });

  it("data-url encodes the ics", () => {
    expect(icsDataUrl(event).startsWith("data:text/calendar;charset=utf-8,")).toBe(true);
  });

  it("builds a Google Calendar template url with a dates range", () => {
    const url = googleCalendarUrl(event);
    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("dates=20300102T010000Z%2F20300102T030000Z");
    expect(url).toContain("location=Edinburgh+Gardens");
  });
});
