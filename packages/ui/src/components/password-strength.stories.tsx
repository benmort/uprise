import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { PasswordStrength } from "./password-strength";
import { PasswordInput } from "./password-input";

/**
 * Strength meter + requirements checklist. Renders nothing for an empty value, then
 * grades Weak → Fair → Good → Strong as more of the five rules pass.
 */
const meta: Meta<typeof PasswordStrength> = {
  title: "PasswordStrength",
  component: PasswordStrength,
};
export default meta;

type Story = StoryObj<typeof PasswordStrength>;

export const Weak: Story = {
  render: () => (
    <div className="max-w-sm">
      <PasswordStrength value="pass" />
    </div>
  ),
};

export const Fair: Story = {
  render: () => (
    <div className="max-w-sm">
      <PasswordStrength value="Passw0" />
    </div>
  ),
};

export const Good: Story = {
  render: () => (
    <div className="max-w-sm">
      <PasswordStrength value="Password1" />
    </div>
  ),
};

export const Strong: Story = {
  render: () => (
    <div className="max-w-sm">
      <PasswordStrength value="Passw0rd!" />
    </div>
  ),
};

/** Live pairing with PasswordInput — the real sign-up / reset-password layout. */
export const WithInput: Story = {
  render: () => {
    const [value, setValue] = React.useState("Passw0");
    return (
      <div className="max-w-sm space-y-3">
        <PasswordInput
          id="pw-strength"
          autoComplete="new-password"
          placeholder="Choose a password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <PasswordStrength value={value} />
      </div>
    );
  },
};
