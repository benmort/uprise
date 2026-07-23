import type { Meta, StoryObj } from "@storybook/react";
import { Ribbon } from "./ribbon";

const meta: Meta<typeof Ribbon> = {
  title: "Ribbon",
  component: Ribbon,
};
export default meta;
type Story = StoryObj<typeof Ribbon>;

export const Default: Story = {
  render: () => (
    <div className="relative h-28 w-56 overflow-hidden rounded-2xl border border-border bg-surface-variant">
      <Ribbon tone="primary" position="top-right">
        New
      </Ribbon>
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Card</div>
    </div>
  ),
};

export const Tones: Story = {
  render: () => (
    <div className="flex gap-4">
      {(["primary", "success", "warning", "error"] as const).map((tone) => (
        <div
          key={tone}
          className="relative h-24 w-40 overflow-hidden rounded-2xl border border-border bg-surface-variant"
        >
          <Ribbon tone={tone} position="top-right">
            {tone}
          </Ribbon>
        </div>
      ))}
    </div>
  ),
};
