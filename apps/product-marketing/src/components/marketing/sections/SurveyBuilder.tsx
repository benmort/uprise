import React from "react";

/**
 * The branching-survey mock: one question, a branch off its strongest answer, and the follow-up that
 * branch leads to — with the disposition the answer maps to spelled out.
 *
 * Ported from the editorial homepage candidate (/homepage3) into the shared library. It earns its
 * place because skip logic is the one capability prose always makes sound simpler than it is: the
 * picture shows the branch.
 */

const MOCK = {
  label: "Branching survey builder",
  meta: "3 steps · 2 branches",
  q1: "Q1 · How do you feel about the proposal?",
  options: ["Strong support", "Lean support", "Undecided", "Lean oppose", "Strong oppose"],
  branch: "IF STRONG SUPPORT →",
  q2: "Q2 · Would you volunteer for a shift?",
  q2Note: "Auto canned-reply fires on first inbound · disposition mapped to",
  q2Disposition: "Supporter — recruit",
  chips: ["Skip logic", "Door + SMS", "Auto canned-reply", "Disposition mapping"],
} as const;

const COPY = {
  eyebrow: "Engagement content",
  title: "Turn conversations into data you can act on",
  body: [
    "Build surveys with per-option skip logic and terminal branches that work on the doors and over SMS, backed by step-based scripts for every channel.",
    "Map custom outcome codes to a five-point support scale, and fire canned replies automatically on the first inbound reply – from an org-wide or personal library.",
  ],
} as const;

/** The mock on its own, for hosts that bring their own prose. */
export function SurveyBuilderMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stroke-secondary bg-white shadow-feature">
      <div className="flex items-center justify-between gap-4 border-b border-stroke-secondary bg-gray-50 px-5 py-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-color-secondary">
          {MOCK.label}
        </span>
        <span className="text-xs text-text-color-secondary">{MOCK.meta}</span>
      </div>

      <div className="flex flex-col gap-3.5 px-6 py-6">
        <div className="flex flex-col gap-2.5 rounded-xl border border-stroke-secondary px-4 py-4">
          <div className="text-[15px] font-semibold text-title-color">{MOCK.q1}</div>
          <div className="flex flex-wrap gap-2">
            {MOCK.options.map((o, i) => (
              <span
                key={o}
                className={`rounded-lg px-3 py-1.5 text-[13px] ${
                  i === 0
                    ? "bg-primary-25 font-semibold text-primary"
                    : "bg-gray-100 font-medium text-text-color"
                }`}
              >
                {o}
              </span>
            ))}
          </div>
        </div>

        {/* The branch. The rule carries the eye from the answer to what it triggers. */}
        <div className="flex items-center gap-2.5 pl-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            {MOCK.branch}
          </span>
          <span aria-hidden className="h-px flex-1 bg-stroke-secondary" />
        </div>

        <div className="ml-4 flex flex-col gap-2 rounded-xl border border-primary-200 bg-primary-25/40 px-4 py-4">
          <div className="text-[15px] font-semibold text-title-color">{MOCK.q2}</div>
          <div className="text-[13px] text-text-color-secondary">
            {MOCK.q2Note}{" "}
            <strong className="font-semibold text-title-color">{MOCK.q2Disposition}</strong>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-stroke-secondary pt-4">
          {MOCK.chips.map((c) => (
            <span
              key={c}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-[13px] font-medium text-text-color"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The full section: the mock beside the prose that explains it. */
export default function SurveyBuilder() {
  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="order-last lg:order-first">
            <SurveyBuilderMock />
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">
              {COPY.eyebrow}
            </span>
            <h2 className="text-3xl font-bold !leading-[1.15] text-title-color md:text-[40px]">
              {COPY.title}
            </h2>
            {COPY.body.map((para) => (
              <p key={para} className="text-base !leading-normal text-text-color-secondary md:text-lg">
                {para}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
