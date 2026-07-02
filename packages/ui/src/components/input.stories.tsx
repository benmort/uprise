import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "Input",
  component: Input,
  args: { placeholder: "name@example.org" },
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const Email: Story = {
  args: { type: "email", placeholder: "info@gmail.com" },
};

export const Filled: Story = {
  args: { defaultValue: "Doorknock intro" },
};

export const Number: Story = {
  args: { type: "number", defaultValue: 5000, placeholder: "5000" },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Locked value" },
};
