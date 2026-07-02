import type { Meta, StoryObj } from "@storybook/react";
import { FormLabel } from "./form-label";
import { FormInput } from "./form-input";

const meta: Meta<typeof FormLabel> = {
  title: "FormLabel",
  component: FormLabel,
  args: { children: "Email" },
};
export default meta;
type Story = StoryObj<typeof FormLabel>;

export const Default: Story = {};

export const Required: Story = {
  args: { children: "Full name", required: true },
};

export const WithControl: Story = {
  render: () => (
    <div>
      <FormLabel htmlFor="contact-email" required>
        Email
      </FormLabel>
      <FormInput id="contact-email" type="email" placeholder="info@gmail.com" />
    </div>
  ),
};
