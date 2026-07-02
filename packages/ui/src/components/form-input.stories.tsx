import type { Meta, StoryObj } from "@storybook/react";
import { FormInput } from "./form-input";

const meta: Meta<typeof FormInput> = {
  title: "FormInput",
  component: FormInput,
  args: { type: "email", placeholder: "info@gmail.com" },
};
export default meta;
type Story = StoryObj<typeof FormInput>;

export const Default: Story = {};

export const Filled: Story = {
  args: { defaultValue: "organiser@uprise.org.au" },
};

export const WithError: Story = {
  args: {
    error: true,
    defaultValue: "not-an-email",
    hint: "Enter a valid email address.",
  },
};

export const WithSuccess: Story = {
  args: {
    success: true,
    defaultValue: "organiser@uprise.org.au",
    hint: "Looks good.",
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "locked@uprise.org.au" },
};
