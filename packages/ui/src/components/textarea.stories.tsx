import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "Textarea",
  component: Textarea,
  args: { placeholder: "Write your message…", rows: 5 },
};
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {};

export const Filled: Story = {
  args: {
    defaultValue:
      "Hi {{first_name}}, thanks for chatting at the door today. Here's the link to volunteer: https://uprise.org.au/join",
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "This canned response is read-only." },
};
