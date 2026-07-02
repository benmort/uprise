import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Select, SelectItem } from "./select";

const meta: Meta<typeof Select> = {
  title: "Select",
  component: Select,
};
export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <div className="w-64">
      <Select placeholder="Select a channel">
        <SelectItem value="SMS">Text (SMS)</SelectItem>
        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
        <SelectItem value="EMAIL">Email</SelectItem>
      </Select>
    </div>
  ),
};

export const Filled: Story = {
  render: () => {
    const [value, setValue] = React.useState("WHATSAPP");
    return (
      <div className="w-64">
        <Select value={value} onValueChange={setValue} placeholder="Select a channel">
          <SelectItem value="SMS">Text (SMS)</SelectItem>
          <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
          <SelectItem value="EMAIL">Email</SelectItem>
        </Select>
      </div>
    );
  },
};

export const Disposition: Story = {
  render: () => {
    const [value, setValue] = React.useState("BOTH");
    return (
      <div className="w-64">
        <Select value={value} onValueChange={setValue}>
          <SelectItem value="BOTH">Both (door + SMS)</SelectItem>
          <SelectItem value="DOOR">Door</SelectItem>
          <SelectItem value="SMS">SMS</SelectItem>
        </Select>
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="w-64">
      <Select defaultValue="EMAIL" disabled>
        <SelectItem value="SMS">Text (SMS)</SelectItem>
        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
        <SelectItem value="EMAIL">Email</SelectItem>
      </Select>
    </div>
  ),
};
