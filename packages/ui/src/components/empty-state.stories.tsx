import type { Meta, StoryObj } from "@storybook/react";
import { MessageSquareOff } from "lucide-react";
import { EmptyState } from "./empty-state";

const meta: Meta<typeof EmptyState> = {
  title: "EmptyState",
  component: EmptyState,
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

/** The empty inbox — the most common feedback state on a data surface. */
export const Default: Story = {
  args: {
    title: "No conversations yet",
    description:
      "When a contact replies to a blast, the thread lands here. Send your first message to get the conversation started.",
  },
};

/** With a call to action wired up (both `ctaLabel` and `onCta` are required to show the button). */
export const WithCta: Story = {
  args: {
    title: "No audiences built",
    description: "Group your contacts into audiences to target blasts and canvassing turf.",
    ctaLabel: "New audience",
    onCta: () => {},
  },
};

/** An error variant reuses the same layout — a can't-load message with a retry. */
export const ErrorState: Story = {
  args: {
    title: "Can't load integrations",
    description: "We couldn't reach the integrations service. Check your connection and try again.",
    ctaLabel: "Retry",
    onCta: () => {},
  },
};

/**
 * The component has no `icon` prop, so an illustrative icon is composed above it
 * to match the intended "empty inbox" treatment.
 */
export const WithIcon: Story = {
  render: () => (
    <div className="space-y-3">
      <div className="flex justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-variant text-muted-foreground">
          <MessageSquareOff className="h-6 w-6" />
        </span>
      </div>
      <EmptyState
        title="No conversations yet"
        description="When a contact replies to a blast, the thread lands here."
        ctaLabel="Start a conversation"
        onCta={() => {}}
      />
    </div>
  ),
};
