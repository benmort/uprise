import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Checkbox } from "./checkbox";

/**
 * Radix Checkbox styled to the design system. Controlled via `checked` /
 * `onCheckedChange`; supports the `"indeterminate"` state.
 */
const meta: Meta<typeof Checkbox> = { title: "Checkbox", component: Checkbox };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Checked: Story = {
  render: () => {
    const [checked, setChecked] = React.useState(true);
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
        Email me campaign updates
      </label>
    );
  },
};

export const Unchecked: Story = {
  render: () => {
    const [checked, setChecked] = React.useState(false);
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
        Send me SMS reminders
      </label>
    );
  },
};

/** Header "select page" checkbox in a mixed state. */
export const Indeterminate: Story = {
  render: () => (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <Checkbox checked="indeterminate" />
      Select all on this page
    </label>
  ),
};

/** A consent list – the common real-world grouping. */
export const ConsentList: Story = {
  render: () => {
    const [prefs, setPrefs] = React.useState({ email: true, sms: false, phone: false });
    const rows: { key: keyof typeof prefs; label: string }[] = [
      { key: "email", label: "Email" },
      { key: "sms", label: "SMS" },
      { key: "phone", label: "Phone calls" },
    ];
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Contact consent</legend>
        {rows.map((r) => (
          <label key={r.key} className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={prefs[r.key]}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, [r.key]: v === true }))}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Checkbox checked disabled />
      Terms accepted (locked)
    </label>
  ),
};
