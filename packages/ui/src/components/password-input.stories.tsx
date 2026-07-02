import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { PasswordInput } from "./password-input";

/**
 * Password field with an inline show/hide toggle. Forwards all native input props,
 * so it is driven like a normal controlled `<input>` (value + onChange event).
 */
const meta: Meta<typeof PasswordInput> = {
  title: "PasswordInput",
  component: PasswordInput,
};
export default meta;

type Story = StoryObj<typeof PasswordInput>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState("hunter2!Pass");
    return (
      <div className="max-w-sm">
        <PasswordInput
          id="pw"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    );
  },
};

export const Empty: Story = {
  render: () => {
    const [value, setValue] = React.useState("");
    return (
      <div className="max-w-sm">
        <PasswordInput
          id="pw-empty"
          placeholder="Enter your password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    );
  },
};

export const NewPassword: Story = {
  render: () => {
    const [value, setValue] = React.useState("Passw0rd!");
    return (
      <div className="max-w-sm">
        <PasswordInput
          id="pw-new"
          autoComplete="new-password"
          placeholder="Choose a password"
          minLength={8}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => {
    const [value, setValue] = React.useState("hunter2!Pass");
    return (
      <div className="max-w-sm">
        <PasswordInput id="pw-disabled" value={value} onChange={(e) => setValue(e.target.value)} disabled />
      </div>
    );
  },
};
