import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "./label";
import { Input } from "./input";

const meta: Meta<typeof Label> = {
  title: "Label",
  component: Label,
  args: { children: "Display name" },
};
export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {};

export const Required: Story = {
  args: { children: "Script name", required: true },
};

export const WithControl: Story = {
  render: () => (
    <div className="space-y-1.5">
      <Label htmlFor="plan-key" required>
        Key (matches plan name)
      </Label>
      <Input id="plan-key" placeholder="scale" />
    </div>
  ),
};
