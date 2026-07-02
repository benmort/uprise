import type { Meta, StoryObj } from "@storybook/react";
import { FormSelect } from "./form-select";

const channelOptions = [
  { value: "SMS", label: "Text (SMS)" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
];

const roleOptions = [
  { value: "ADMIN", label: "Admin" },
  { value: "ORGANISER", label: "Organiser" },
  { value: "CANVASSER", label: "Canvasser" },
];

const meta: Meta<typeof FormSelect> = {
  title: "FormSelect",
  component: FormSelect,
  args: { options: channelOptions, placeholder: "Select a channel" },
};
export default meta;
type Story = StoryObj<typeof FormSelect>;

export const Default: Story = {};

export const Filled: Story = {
  args: { defaultValue: "WHATSAPP" },
};

export const Roles: Story = {
  args: { options: roleOptions, placeholder: "Select a role", defaultValue: "ORGANISER" },
};

export const WithError: Story = {
  args: { error: true, hint: "Choose a channel to continue." },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "EMAIL" },
};
