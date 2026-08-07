import type { Meta, StoryObj } from "@storybook/react";
import { ProgressBar } from "./progress-bar";

const meta: Meta<typeof ProgressBar> = {
  title: "ProgressBar",
  component: ProgressBar,
};
export default meta;

type Story = StoryObj<typeof ProgressBar>;

export const Basic: Story = {
  args: { value: 62, max: 100 },
};

export const WithLabel: Story = {
  args: {
    value: 48,
    max: 120,
    label: (
      <>
        <span>Doors knocked</span>
        <span>48 / 120</span>
      </>
    ),
  },
};

/** The tone palette — success (completion), primary (neutral progress), knock (canvassing). */
export const Tones: Story = {
  render: () => (
    <div className="w-72 space-y-3">
      <ProgressBar value={70} tone="success" />
      <ProgressBar value={70} tone="primary" />
      <ProgressBar value={70} tone="knock" />
    </div>
  ),
};
