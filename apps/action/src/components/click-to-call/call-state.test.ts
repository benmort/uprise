import { describe, expect, it } from "vitest";
import type { CallWidgetScreen } from "@uprise/ui";
import { reduceProgress } from "./call-state";

/**
 * The widget's screen reducer — the ported event taxonomy. Transport is the
 * container's job; these pin that each progress event lands on the right
 * sub-screen and that terminal events win from anywhere.
 */

const inCall = (view: Extract<CallWidgetScreen, { kind: "in-call" }>["view"]): CallWidgetScreen => ({
  kind: "in-call",
  view,
});

describe("reduceProgress", () => {
  it("connects into the waiting screen", () => {
    expect(reduceProgress({ kind: "connecting" }, { name: "call_connected" })).toEqual(
      inCall({ kind: "waiting" }),
    );
  });

  it("electoral flow: postcode → districts menu only when genuinely ambiguous", () => {
    const postcode = reduceProgress(inCall({ kind: "waiting" }), { name: "call_electoral_postcode" });
    expect(postcode).toEqual(inCall({ kind: "postcode" }));

    const single = reduceProgress(postcode, {
      name: "call_electoral_lookup",
      payload: { postcode: "2000", electorates: ["Sydney"] },
    });
    expect(single).toEqual(inCall({ kind: "waiting" }));

    const multi = reduceProgress(postcode, {
      name: "call_electoral_lookup",
      payload: { postcode: "3058", electorates: ["Wills", "Cooper"] },
    });
    expect(multi).toEqual(inCall({ kind: "districts", options: ["Wills", "Cooper"] }));
  });

  it("target resolution shows the redirecting screen with the member's full identity", () => {
    const target = reduceProgress(inCall({ kind: "districts", options: ["Wills", "Cooper"] }), {
      name: "call_electoral_target",
      payload: { name: "Alex Example", party: "ALP", electorate: "Wills", imageUrl: "https://img/a.jpg" },
    });
    expect(target).toEqual(
      inCall({
        kind: "redirecting",
        name: "Alex Example",
        target: {
          name: "Alex Example",
          party: "ALP",
          electorate: "Wills",
          imageUrl: "https://img/a.jpg",
          imageCredit: null,
        },
      }),
    );
  });

  it("survey questions render their options; an answer returns to waiting until the next question", () => {
    const survey = reduceProgress(inCall({ kind: "waiting" }), {
      name: "call_survey",
      payload: {
        question: "Do you support raising the rate?",
        options: [
          { digit: "1", label: "Yes" },
          { digit: "2", label: "No" },
        ],
      },
    });
    expect(survey).toEqual(
      inCall({
        kind: "survey",
        question: "Do you support raising the rate?",
        options: [
          { digit: "1", label: "Yes" },
          { digit: "2", label: "No" },
        ],
      }),
    );
    expect(reduceProgress(survey, { name: "call_survey_result", payload: { digit: "1" } })).toEqual(
      inCall({ kind: "waiting" }),
    );
  });

  it("conference join keeps the identity (photo carried from redirecting); hangup → target-gone", () => {
    const redirecting = reduceProgress(inCall({ kind: "waiting" }), {
      name: "call_electoral_target",
      payload: { name: "Alex Example", party: "ALP", imageUrl: "https://img/a.jpg" },
    });
    // The conference event carries name/party only — the photo rides through.
    const connected = reduceProgress(redirecting, {
      name: "call_connected_conference",
      payload: { name: "Alex Example", electorate: "Wills" },
    });
    expect(connected).toEqual(
      inCall({
        kind: "connected",
        name: "Alex Example",
        target: {
          name: "Alex Example",
          party: "ALP",
          electorate: "Wills",
          imageUrl: "https://img/a.jpg",
          imageCredit: null,
        },
      }),
    );
    expect(reduceProgress(connected, { name: "call_target_hangup" })).toEqual(
      inCall({ kind: "target-gone" }),
    );
    expect(
      reduceProgress(connected, { name: "call_disconnected", payload: { leg: "target" } }),
    ).toEqual(inCall({ kind: "target-gone" }));
  });

  it("terminal events win from any live state, but never resurrect an error", () => {
    expect(reduceProgress(inCall({ kind: "connected" }), { name: "call_ended" })).toEqual({
      kind: "ended",
    });
    const error = reduceProgress(inCall({ kind: "waiting" }), {
      name: "error",
      payload: { message: "boom" },
    });
    expect(error).toMatchObject({ kind: "error", message: "boom" });
    expect(reduceProgress(error, { name: "call_ended" })).toEqual(error);
  });

  it("progress events never disturb idle/ended screens (stale stream replay)", () => {
    expect(reduceProgress({ kind: "idle" }, { name: "call_survey", payload: {} })).toEqual({
      kind: "idle",
    });
    expect(reduceProgress({ kind: "ended" }, { name: "call_connected" })).toEqual({ kind: "ended" });
  });
});
