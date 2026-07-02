import type { Meta, StoryObj } from "@storybook/react";
import { TooltipHint } from "./tooltip-hint";

const meta: Meta<typeof TooltipHint> = {
  title: "TooltipHint",
  component: TooltipHint,
};
export default meta;

type Story = StoryObj<typeof TooltipHint>;

/**
 * The bare help affordance. Note: the tooltip is Radix-backed and only reveals
 * its content on hover or keyboard focus — a static snapshot shows just the
 * help icon. Hover (or Tab to) the icon to see the label.
 */
export const Default: Story = {
  args: { label: "Time window for the trend chart." },
};

/** Alongside a field label, the way it appears in the blast composer. */
export const NextToLabel: Story = {
  render: () => (
    <label className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
      Message body
      <TooltipHint label="Use merge tags such as {{first_name}}. Drag chips into the message body." />
    </label>
  ),
};

/** A longer compliance explanation — the tooltip wraps to its fixed width. */
export const LongLabel: Story = {
  args: {
    label:
      "The compliant way to reach native groups: invite people to a group you run in the WhatsApp app. Twilio can't post to groups directly.",
  },
};
