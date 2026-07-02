import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Flag, Home, Megaphone, Search } from "lucide-react";
import { RoleSelectCards, type RoleOption } from "./role-select-cards";

/**
 * Single-select role cards (icon + title + subtitle + radio) — the onboarding
 * "How do you want to help?" step. Options mirror the volunteer onboarding wizard.
 */
const meta: Meta<typeof RoleSelectCards> = {
  title: "RoleSelectCards",
  component: RoleSelectCards,
};
export default meta;

type Story = StoryObj<typeof RoleSelectCards>;

const ROLE_OPTIONS: RoleOption[] = [
  { value: "hander-outer", title: "Hander-outer", subtitle: "Hand flyers at booths & stalls", icon: Megaphone },
  { value: "doorknocker", title: "Doorknocker", subtitle: "Have conversations at the door", icon: Home },
  { value: "booth-captain", title: "Booth captain", subtitle: "Run a polling booth on the day", icon: Flag },
  { value: "scrutineer", title: "Scrutineer", subtitle: "Observe the count", icon: Search },
];

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState<string | null>("doorknocker");
    return (
      <div className="max-w-sm">
        <RoleSelectCards options={ROLE_OPTIONS} value={value} onChange={setValue} />
      </div>
    );
  },
};

export const NoneSelected: Story = {
  render: () => {
    const [value, setValue] = React.useState<string | null>(null);
    return (
      <div className="max-w-sm">
        <RoleSelectCards options={ROLE_OPTIONS} value={value} onChange={setValue} />
      </div>
    );
  },
};

export const TwoOptions: Story = {
  render: () => {
    const [value, setValue] = React.useState<string | null>("hander-outer");
    return (
      <div className="max-w-sm">
        <RoleSelectCards options={ROLE_OPTIONS.slice(0, 2)} value={value} onChange={setValue} />
      </div>
    );
  },
};
