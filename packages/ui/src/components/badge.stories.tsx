import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge";

const meta: Meta<typeof Badge> = {
  title: "Badge",
  component: Badge,
  args: { children: "Badge" },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="neutral">Neutral</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const WithDot: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success" dot>
        Active
      </Badge>
      <Badge variant="warning" dot>
        Pending
      </Badge>
      <Badge variant="error" dot>
        Failed
      </Badge>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
    </div>
  ),
};
