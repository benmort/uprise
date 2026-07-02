import type { Meta, StoryObj } from "@storybook/react";
import { FormTextarea } from "./form-textarea";

const meta: Meta<typeof FormTextarea> = {
  title: "FormTextarea",
  component: FormTextarea,
  args: { placeholder: "Enter a description...", rows: 6 },
};
export default meta;
type Story = StoryObj<typeof FormTextarea>;

export const Default: Story = {};

export const Filled: Story = {
  args: {
    defaultValue:
      "Hi {{first_name}}, we're doorknocking your street this Saturday about the new bus route. Can we count on your support?",
  },
};

export const WithError: Story = {
  args: { error: true, hint: "Message body is required." },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "This template is locked and can't be edited." },
};
