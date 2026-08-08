import { describe, expect, it } from "vitest";
import { describeBlastSendOutcome } from "./send-outcome";

describe("describeBlastSendOutcome — queued shape (how production runs)", () => {
  /**
   * THE regression. With FEATURE_BULLMQ_BLAST_ENABLED on, the endpoint answers
   * `{ queued, jobId, blast }` — no `sent` key. `data.sent || 0` therefore reported every
   * successful send as "0 recipients queued", with the chip still on PROOFED because the blast
   * row was read before the worker ran. The rational response to "nothing went out" is to press
   * Send again, and each press is real money and a duplicate wave to real people.
   */
  it("never claims zero recipients when the worker owns the dispatch", () => {
    const out = describeBlastSendOutcome({
      queued: true,
      jobId: "job-1",
      blast: { id: "b1", status: "PROOFED" },
    });
    expect(out.message).not.toMatch(/\b0\b/);
    expect(out.title).toBe("Blast queued");
    expect(out.queued).toBe(true);
  });

  // The chip must not sit on PROOFED after a successful send — that row predates the worker.
  it("reports SENDING rather than the pre-worker blast status", () => {
    const out = describeBlastSendOutcome({ queued: true, jobId: "j", blast: { status: "PROOFED" } });
    expect(out.status).toBe("SENDING");
  });

  // A stable jobId collapses a duplicate enqueue. Saying "sent!" twice invites a third press.
  it("says a run is already in flight instead of reporting a second success", () => {
    const out = describeBlastSendOutcome({ queued: false, jobId: "job-1", blast: {} });
    expect(out.title).toBe("Already sending");
    expect(out.message).toMatch(/already/i);
  });
});

describe("describeBlastSendOutcome — inline shape", () => {
  it("reports the real counts", () => {
    const out = describeBlastSendOutcome({ sent: 475, failed: 0, remaining: 0, blast: { status: "SENT" } });
    expect(out.message).toContain("475 sent");
    expect(out.status).toBe("SENT");
    expect(out.queued).toBe(false);
  });

  // The old copy named only the successes, so a half-failed send read as an unqualified success.
  it("surfaces failures instead of reporting an unqualified success", () => {
    const out = describeBlastSendOutcome({ sent: 300, failed: 175, remaining: 0, blast: { status: "SENT" } });
    expect(out.title).toMatch(/failure/i);
    expect(out.message).toContain("175 failed");
  });

  it("says how many are still to go on a bounded inline run", () => {
    const out = describeBlastSendOutcome({ sent: 475, failed: 0, remaining: 1525, blast: { status: "SENDING" } });
    expect(out.message).toContain("1,525 still to go");
  });

  // A genuine zero is different from a missing field, and must still read as zero.
  it("reports an honest zero when the inline path really sent nothing", () => {
    const out = describeBlastSendOutcome({ sent: 0, failed: 0, remaining: 0, blast: { status: "SENT" } });
    expect(out.message).toContain("0 sent");
    expect(out.queued).toBe(false);
  });
});

describe("describeBlastSendOutcome — junk in", () => {
  it("does not throw or invent a count", () => {
    for (const junk of [null, undefined, "nope", 42, []]) {
      const out = describeBlastSendOutcome(junk);
      expect(out.queued).toBe(true);
      expect(out.message).not.toMatch(/\b0\b/);
    }
  });
});
