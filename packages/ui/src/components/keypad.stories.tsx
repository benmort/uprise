import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Keypad } from "./keypad";

/**
 * On-screen numeric keypad (1–9, 0, ⌫) for the phone + OTP onboarding steps. It is
 * stateless — the parent holds the value and reacts to onKey / onBackspace.
 */
const meta: Meta<typeof Keypad> = {
  title: "Keypad",
  component: Keypad,
};
export default meta;

type Story = StoryObj<typeof Keypad>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState("0401");
    return (
      <div className="max-w-xs space-y-4">
        <p className="text-center text-2xl font-bold tabular-nums text-foreground">{value || "—"}</p>
        <Keypad onKey={(d) => setValue((v) => v + d)} onBackspace={() => setValue((v) => v.slice(0, -1))} />
      </div>
    );
  },
};

export const Empty: Story = {
  render: () => {
    const [value, setValue] = React.useState("");
    return (
      <div className="max-w-xs space-y-4">
        <p className="text-center text-2xl font-bold tabular-nums text-foreground">{value || "—"}</p>
        <Keypad onKey={(d) => setValue((v) => v + d)} onBackspace={() => setValue((v) => v.slice(0, -1))} />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => {
    const [value, setValue] = React.useState("0401556098");
    return (
      <div className="max-w-xs space-y-4">
        <p className="text-center text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <Keypad onKey={(d) => setValue((v) => v + d)} onBackspace={() => setValue((v) => v.slice(0, -1))} disabled />
      </div>
    );
  },
};
