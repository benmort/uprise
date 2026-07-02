import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { PhoneNumberField } from "./phone-number-field";
import { Keypad } from "./keypad";

/**
 * Large read-out of a mobile number being entered on the on-screen Keypad — `+61`
 * prefix + grouped digits over an underline. Display-only: the Keypad owns the value.
 */
const meta: Meta<typeof PhoneNumberField> = {
  title: "PhoneNumberField",
  component: PhoneNumberField,
};
export default meta;

type Story = StoryObj<typeof PhoneNumberField>;

export const Filled: Story = {
  render: () => {
    const [value] = React.useState("0401556098");
    return (
      <div className="max-w-sm">
        <PhoneNumberField value={value} />
      </div>
    );
  },
};

export const Empty: Story = {
  render: () => {
    const [value] = React.useState("");
    return (
      <div className="max-w-sm">
        <PhoneNumberField value={value} />
      </div>
    );
  },
};

export const PartiallyEntered: Story = {
  render: () => {
    const [value] = React.useState("0401");
    return (
      <div className="max-w-sm">
        <PhoneNumberField value={value} />
      </div>
    );
  },
};

/** The real onboarding phone step: Keypad drives the field's value. */
export const DrivenByKeypad: Story = {
  render: () => {
    const [value, setValue] = React.useState("0401556098");
    return (
      <div className="max-w-xs space-y-8">
        <PhoneNumberField value={value} />
        <Keypad
          onKey={(d) => setValue((v) => (v.length < 10 ? v + d : v))}
          onBackspace={() => setValue((v) => v.slice(0, -1))}
        />
      </div>
    );
  },
};
