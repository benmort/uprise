import type { Meta, StoryObj } from "@storybook/react";
import { Field } from "./field";
import { Input } from "./input";

const meta: Meta<typeof Field> = {
  title: "Field",
  component: Field,
};
export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = {
  args: {
    label: "Script name",
    htmlFor: "script-name",
    children: <Input id="script-name" defaultValue="Doorknock intro" />,
  },
};

export const Required: Story = {
  args: {
    label: "Invite by email",
    htmlFor: "invite-email",
    required: true,
    children: <Input id="invite-email" type="email" placeholder="name@example.org" />,
  },
};

export const WithHint: Story = {
  args: {
    label: "Channel",
    htmlFor: "script-channel",
    hint: "Where this script is used.",
    children: <Input id="script-channel" defaultValue="SMS" />,
  },
};

export const WithError: Story = {
  args: {
    label: "Invite by email",
    htmlFor: "invite-email-error",
    error: "Enter a valid email address.",
    children: <Input id="invite-email-error" type="email" defaultValue="not-an-email" />,
  },
};
