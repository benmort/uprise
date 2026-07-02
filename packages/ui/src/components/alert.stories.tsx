import type { Meta, StoryObj } from "@storybook/react";
import { Alert } from "./alert";

const meta: Meta<typeof Alert> = {
  title: "Alert",
  component: Alert,
  args: { variant: "info", title: "Heads up", message: "Your changes have been saved as a draft." },
};
export default meta;
type Story = StoryObj<typeof Alert>;

export const Info: Story = {};
export const Success: Story = {
  args: { variant: "success", title: "Blast sent", message: "1,204 messages queued for delivery." },
};
export const Warning: Story = {
  args: { variant: "warning", title: "Approval pending", message: "This request is awaiting an organiser." },
};
export const Error: Story = {
  args: { variant: "error", title: "Couldn't send", message: "Invalid email or password." },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex w-[420px] flex-col gap-3">
      <Alert variant="success" title="Blast sent" message="1,204 messages queued." />
      <Alert variant="info" title="Heads up" message="Saved as a draft." />
      <Alert variant="warning" title="Approval pending" message="Awaiting an organiser." />
      <Alert variant="error" title="Couldn't send" message="Invalid email or password." />
    </div>
  ),
};
