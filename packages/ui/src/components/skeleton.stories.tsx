import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "./skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Skeleton",
  component: Skeleton,
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

/** Shape is driven entirely by `className` — here a single line of text. */
export const Line: Story = { args: { className: "h-3 w-48" } };

/** A block placeholder for a card or panel — `w-full` fills its container. */
export const Block: Story = {
  render: () => (
    <div className="w-80">
      <Skeleton className="h-32 w-full" />
    </div>
  ),
};

/** A circle for an avatar placeholder. */
export const AvatarCircle: Story = { args: { className: "h-10 w-10 rounded-full" } };

/** The dashboard loading state — a header, a row of stat cards, then a table. */
export const DashboardLoading: Story = {
  render: () => (
    <div className="space-y-4">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-80" />
    </div>
  ),
};

/** A stat card while its metric loads. */
export const StatCard: Story = {
  render: () => (
    <div className="rounded-md border border-border p-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-16" />
    </div>
  ),
};
