import type { Meta, StoryObj } from "@storybook/react";
import { EventStatusBadge, type DerivedEventStatus } from "./event-status-badge";

const meta: Meta<typeof EventStatusBadge> = {
  title: "EventStatusBadge",
  component: EventStatusBadge,
  args: { status: "upcoming" },
};
export default meta;
type Story = StoryObj<typeof EventStatusBadge>;

export const Default: Story = {};

export const AllStatuses: Story = {
  render: () => {
    const statuses: DerivedEventStatus[] = ["draft", "upcoming", "ongoing", "completed", "cancelled"];
    return (
      <div className="flex flex-wrap items-center gap-2">
        {statuses.map((s) => (
          <EventStatusBadge key={s} status={s} />
        ))}
      </div>
    );
  },
};
