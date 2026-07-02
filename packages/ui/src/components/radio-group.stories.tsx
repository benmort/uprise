import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { RadioGroup, RadioGroupItem } from "./radio-group";

/**
 * Radix RadioGroup styled to the design system. Controlled with `value` /
 * `onValueChange` on the group and one `RadioGroupItem` per option.
 */
const meta: Meta<typeof RadioGroup> = { title: "RadioGroup", component: RadioGroup };
export default meta;
type Story = StoryObj<typeof RadioGroup>;

/** Canvasser role selection. */
export const Roles: Story = {
  render: () => {
    const [value, setValue] = React.useState("volunteer");
    const options = [
      { value: "volunteer", label: "Volunteer", hint: "Field canvassing only" },
      { value: "organiser", label: "Organiser", hint: "Staff / admin access" },
      { value: "owner", label: "Owner", hint: "Full tenant + billing control" },
    ];
    return (
      <RadioGroup value={value} onValueChange={setValue}>
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm text-foreground">
            <RadioGroupItem value={o.value} id={`role-${o.value}`} className="mt-0.5" />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    );
  },
};

/** Blast channel picker. */
export const Channel: Story = {
  render: () => {
    const [value, setValue] = React.useState("sms");
    const options = [
      { value: "sms", label: "SMS" },
      { value: "email", label: "Email" },
      { value: "whatsapp", label: "WhatsApp" },
    ];
    return (
      <RadioGroup value={value} onValueChange={setValue}>
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm text-foreground">
            <RadioGroupItem value={o.value} id={`channel-${o.value}`} />
            {o.label}
          </label>
        ))}
      </RadioGroup>
    );
  },
};

/** With one option disabled (e.g. a channel not enabled for the tenant). */
export const WithDisabledOption: Story = {
  render: () => {
    const [value, setValue] = React.useState("email");
    return (
      <RadioGroup value={value} onValueChange={setValue}>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <RadioGroupItem value="email" id="d-email" />
          Email
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <RadioGroupItem value="sms" id="d-sms" />
          SMS
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <RadioGroupItem value="whatsapp" id="d-whatsapp" disabled />
          WhatsApp (not enabled)
        </label>
      </RadioGroup>
    );
  },
};
