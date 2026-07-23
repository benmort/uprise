import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "./progress";

const meta: Meta<typeof Progress> = {
  title: "Progress",
  component: Progress,
  args: { value: 60 },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-3">
      <Progress value={60} tone="primary" />
      <Progress value={40} tone="success" />
      <Progress value={80} tone="warning" />
      <Progress value={25} tone="error" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-3">
      <Progress value={50} size="sm" />
      <Progress value={50} size="md" />
      <Progress value={50} size="lg" />
    </div>
  ),
};
