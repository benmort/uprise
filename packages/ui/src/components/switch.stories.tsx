import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "./switch";

const meta: Meta<typeof Switch> = {
  title: "Switch",
  component: Switch,
};
export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = { args: { defaultChecked: true } };
export const Off: Story = { args: { defaultChecked: false } };
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

export const Controlled: Story = {
  render: () => {
    function Demo() {
      const [on, setOn] = useState(true);
      return (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch checked={on} onCheckedChange={setOn} />
          Notifications {on ? "on" : "off"}
        </label>
      );
    }
    return <Demo />;
  },
};
