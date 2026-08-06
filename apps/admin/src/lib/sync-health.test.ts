import { describe, expect, it } from "vitest";
import { importSummaryLine, labelSkipReason, reasonRowsFromStats } from "./sync-health";

describe("labelSkipReason", () => {
  it("labels the known reasons in organiser language", () => {
    expect(labelSkipReason("missing_phone_number")).toBe("No mobile number – kept as email-only");
    expect(labelSkipReason("invalid_phone_format")).toBe("Phone number couldn't be read");
    expect(labelSkipReason("tag_apply_failed")).toBe("Tags couldn't be copied");
  });

  it("humanises unknown keys instead of leaking snake_case", () => {
    expect(labelSkipReason("weird_new_reason")).toBe("Weird new reason");
    expect(labelSkipReason("")).toBe("Other");
  });
});

describe("reasonRowsFromStats", () => {
  it("sorts largest first and drops zeroes", () => {
    expect(
      reasonRowsFromStats({ reasonCounts: { invalid_phone_format: 2, missing_phone_number: 9, tag_apply_failed: 0 } }),
    ).toEqual([
      ["No mobile number – kept as email-only", 9],
      ["Phone number couldn't be read", 2],
    ]);
  });

  it("is empty for missing stats", () => {
    expect(reasonRowsFromStats(null)).toEqual([]);
    expect(reasonRowsFromStats({})).toEqual([]);
  });
});

describe("importSummaryLine", () => {
  it("reads a post-fix run: email-only people inside the synced count", () => {
    expect(
      importSummaryLine(1204, { skippedNoPhone: 214, skippedInvalidPhone: 20, failedPersist: 8 }),
    ).toBe("1,204 imported · 214 email-only (kept, not textable) · 28 skipped");
  });

  it("reads a pre-fix run: email-only people were dropped, so they report as skipped", () => {
    // Old pipeline: syncedCount 0 because everyone was email-only and dropped.
    expect(importSummaryLine(0, { skippedNoPhone: 50 })).toBe("0 imported · 50 skipped");
  });

  it("collapses to the plain count when nothing was skipped", () => {
    expect(importSummaryLine(75, { skippedNoPhone: 0 })).toBe("75 imported");
    expect(importSummaryLine(75, null)).toBe("75 imported");
  });
});
