import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { StepProgress } from "./step-progress";

/**
 * Segmented step indicator — the onboarding wizard's header bar. `current` is a
 * 1-based count of filled segments out of `total`. (The component takes only
 * current/total; the labels below are story decoration.)
 */
const meta: Meta<typeof StepProgress> = {
  title: "StepProgress",
  component: StepProgress,
};
export default meta;

type Story = StoryObj<typeof StepProgress>;

const LABELS = ["Phone", "Verify", "Details", "Done"];

export const Default: Story = {
  render: () => {
    const [current] = React.useState(2);
    return (
      <div className="max-w-md space-y-2">
        <StepProgress current={current} total={LABELS.length} />
        <div className="flex justify-between text-xs text-muted-foreground">
          {LABELS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    );
  },
};

export const FirstStep: Story = {
  render: () => {
    const [current] = React.useState(1);
    return (
      <div className="w-[28rem]">
        <StepProgress current={current} total={LABELS.length} />
      </div>
    );
  },
};

export const Complete: Story = {
  render: () => {
    const [current] = React.useState(4);
    return (
      <div className="w-[28rem]">
        <StepProgress current={current} total={LABELS.length} />
      </div>
    );
  },
};

/** Interactive: step through the wizard with Back / Next. */
export const Interactive: Story = {
  render: () => {
    const total = LABELS.length;
    const [current, setCurrent] = React.useState(2);
    return (
      <div className="max-w-md space-y-4">
        <StepProgress current={current} total={total} />
        <p className="text-sm text-muted-foreground">
          Step {current} of {total} — {LABELS[Math.min(current, total) - 1]}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={current <= 1}
            onClick={() => setCurrent((c) => Math.max(1, c - 1))}
          >
            Back
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={current >= total}
            onClick={() => setCurrent((c) => Math.min(total, c + 1))}
          >
            Next
          </button>
        </div>
      </div>
    );
  },
};
