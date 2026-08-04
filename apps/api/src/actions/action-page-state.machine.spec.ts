import { ActionPageStatus } from "@uprise/db";
import {
  ACTION_PAGE_TRANSITIONS,
  assertValidActionPageTransition,
  canTransitionActionPage,
} from "./action-page-state.machine";

describe("action-page state machine", () => {
  const S = ActionPageStatus;
  const legal: Array<[ActionPageStatus, ActionPageStatus]> = [
    [S.DRAFT, S.PUBLISHED],
    [S.DRAFT, S.ARCHIVED],
    [S.PUBLISHED, S.DRAFT],
    [S.PUBLISHED, S.ARCHIVED],
    [S.ARCHIVED, S.DRAFT],
  ];

  it("permits exactly the declared transitions", () => {
    const all = Object.values(S);
    for (const from of all) {
      for (const to of all) {
        const expected = legal.some(([f, t]) => f === from && t === to);
        expect(canTransitionActionPage(from, to)).toBe(expected);
      }
    }
  });

  it("throws 409 with the domain code on an illegal transition", () => {
    try {
      assertValidActionPageTransition(S.ARCHIVED, S.PUBLISHED);
      fail("expected throw");
    } catch (err) {
      const e = err as { getStatus: () => number; getResponse: () => { error: { code: string } } };
      expect(e.getStatus()).toBe(409);
      expect(e.getResponse().error.code).toBe("INVALID_ACTION_PAGE_TRANSITION");
    }
  });

  it("does not throw on a legal transition", () => {
    for (const [from, to] of legal) {
      expect(() => assertValidActionPageTransition(from, to)).not.toThrow();
    }
  });

  it("declares every status in the map (no status can strand)", () => {
    expect(Object.keys(ACTION_PAGE_TRANSITIONS).sort()).toEqual(Object.values(S).sort());
  });
});
