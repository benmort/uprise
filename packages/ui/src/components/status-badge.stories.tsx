import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "./status-badge";

const meta: Meta<typeof StatusBadge> = {
  title: "StatusBadge",
  component: StatusBadge,
};
export default meta;

type Story = StoryObj<typeof StatusBadge>;

export const Sent: Story = { args: { status: "SENT" } };

export const Failed: Story = { args: { status: "FAILED" } };

export const Scheduled: Story = { args: { status: "SCHEDULED" } };

/** The label is derived from the status string, and a `children` count sits on the right. */
export const WithCount: Story = { args: { status: "DELIVERED", children: "1,204" } };

/** The messaging lifecycle badges an organiser sees on a blast. */
export const MessagingLifecycle: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {["DRAFTED", "PROOFED", "SCHEDULED", "SENDING", "SENT", "FAILED"].map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

/** Every mapped status — the full palette across messaging, inbox SLA, canvassing sync and walk lists. */
export const Gallery: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[
        "SENT",
        "FAILED",
        "SCHEDULED",
        "PENDING",
        "COMPLETED",
        "ACTIVE",
        "ARCHIVED",
        "RESPONDED",
        "READ",
        "OPTED_OUT",
        "SLA_WARNING",
        "SLA_BREACH",
        "SYNCED",
        "PENDING_SYNC",
        "SYNC_CONFLICT",
        "OFFLINE",
        "VISITED",
        "SKIPPED",
        "UNASSIGNED",
        "IN_PROGRESS",
      ].map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};
