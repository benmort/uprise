import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { PhoneInput } from "./phone-input";

/**
 * International phone input (country picker + national formatting) storing
 * E.164 — the supporter-phone field on public forms and the click-to-call
 * widget. Defaults to Australia.
 */
const meta: Meta<typeof PhoneInput> = {
  title: "PhoneInput",
  component: PhoneInput,
};
export default meta;

type Story = StoryObj<typeof PhoneInput>;

export const Empty: Story = {
  render: () => {
    const [value, setValue] = React.useState("");
    return (
      <div className="w-80">
        <PhoneInput value={value} onChange={setValue} aria-label="Mobile number" />
        <p className="mt-2 font-mono text-xs text-muted-foreground">{value || "—"}</p>
      </div>
    );
  },
};

export const Filled: Story = {
  render: () => {
    const [value, setValue] = React.useState("+61481565866");
    return (
      <div className="w-80">
        <PhoneInput value={value} onChange={setValue} aria-label="Mobile number" />
        <p className="mt-2 font-mono text-xs text-muted-foreground">{value}</p>
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="w-80">
      <PhoneInput value="+61400000000" disabled aria-label="Mobile number" />
    </div>
  ),
};
