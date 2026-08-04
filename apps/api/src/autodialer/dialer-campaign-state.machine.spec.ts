import { DialerCampaignStatus } from "@uprise/db";
import {
  DIALER_CAMPAIGN_TRANSITIONS,
  assertValidDialerCampaignTransition,
  canTransitionDialerCampaign,
} from "./dialer-campaign-state.machine";

const ALL = Object.values(DialerCampaignStatus);

describe("dialer-campaign-state.machine", () => {
  it("covers every status in the transition map", () => {
    for (const status of ALL) {
      expect(DIALER_CAMPAIGN_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("allows the full legal matrix", () => {
    const legal: Array<[DialerCampaignStatus, DialerCampaignStatus]> = [
      [DialerCampaignStatus.DRAFT, DialerCampaignStatus.ACTIVE],
      [DialerCampaignStatus.DRAFT, DialerCampaignStatus.ARCHIVED],
      [DialerCampaignStatus.ACTIVE, DialerCampaignStatus.PAUSED],
      [DialerCampaignStatus.ACTIVE, DialerCampaignStatus.COMPLETED],
      [DialerCampaignStatus.ACTIVE, DialerCampaignStatus.ARCHIVED],
      [DialerCampaignStatus.PAUSED, DialerCampaignStatus.ACTIVE],
      [DialerCampaignStatus.PAUSED, DialerCampaignStatus.COMPLETED],
      [DialerCampaignStatus.PAUSED, DialerCampaignStatus.ARCHIVED],
      [DialerCampaignStatus.COMPLETED, DialerCampaignStatus.ARCHIVED],
    ];
    for (const [from, to] of legal) {
      expect(canTransitionDialerCampaign(from, to)).toBe(true);
      expect(() => assertValidDialerCampaignTransition(from, to)).not.toThrow();
    }
  });

  it("rejects every transition not in the map", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const legal = DIALER_CAMPAIGN_TRANSITIONS[from].includes(to);
        expect(canTransitionDialerCampaign(from, to)).toBe(legal);
        if (!legal) {
          // ApiHttpException carries the detail in its response body, not the message.
          expect(() => assertValidDialerCampaignTransition(from, to)).toThrow();
        }
      }
    }
  });

  it("COMPLETED cannot re-activate — clone is the re-run path", () => {
    expect(canTransitionDialerCampaign(DialerCampaignStatus.COMPLETED, DialerCampaignStatus.ACTIVE)).toBe(
      false,
    );
  });

  it("ARCHIVED is terminal", () => {
    expect(DIALER_CAMPAIGN_TRANSITIONS[DialerCampaignStatus.ARCHIVED]).toEqual([]);
  });

  it("throws a 409 with the domain error code", () => {
    try {
      assertValidDialerCampaignTransition(DialerCampaignStatus.COMPLETED, DialerCampaignStatus.ACTIVE);
      fail("expected throw");
    } catch (err) {
      const e = err as { getStatus?: () => number; getResponse?: () => unknown };
      expect(e.getStatus?.()).toBe(409);
      expect(JSON.stringify(e.getResponse?.())).toContain("INVALID_DIALER_CAMPAIGN_TRANSITION");
    }
  });
});
