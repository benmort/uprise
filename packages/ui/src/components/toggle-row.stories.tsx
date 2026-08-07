import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ToggleRow } from "./toggle-row";

const meta: Meta<typeof ToggleRow> = {
  title: "ToggleRow",
  component: ToggleRow,
};
export default meta;

type Story = StoryObj<typeof ToggleRow>;

function Controlled(props: Partial<React.ComponentProps<typeof ToggleRow>>) {
  const [on, setOn] = useState(true);
  return <ToggleRow label="Door-knocks" checked={on} onCheckedChange={setOn} {...props} />;
}

export const Basic: Story = {
  render: () => <Controlled aria-label="Door-knocks" />,
};

export const WithDescription: Story = {
  render: () => (
    <Controlled
      label="Support levels"
      description="Only sent for door-knocks where consent was recorded."
      aria-label="Support levels"
    />
  ),
};

/** `busy` disables the switch and shows a spinner while a save is in flight. */
export const Busy: Story = {
  render: () => <Controlled busy aria-label="Door-knocks" />,
};

export const Disabled: Story = {
  args: { label: "Opt-outs (always on)", checked: true, disabled: true, onCheckedChange: () => {}, "aria-label": "Opt-outs (always on)" },
};
