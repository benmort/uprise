import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "./tooltip";
import { Button } from "./button";

const meta: Meta<typeof Tooltip> = {
  title: "Tooltip",
  component: Tooltip,
};
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip content="A helpful hint">
      <Button variant="outline">Hover me</Button>
    </Tooltip>
  ),
};

export const Sides: Story = {
  render: () => (
    <div className="flex gap-3">
      <Tooltip content="Top" side="top">
        <Button variant="outline">Top</Button>
      </Tooltip>
      <Tooltip content="Bottom" side="bottom">
        <Button variant="outline">Bottom</Button>
      </Tooltip>
    </div>
  ),
};
