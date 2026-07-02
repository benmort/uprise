import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { DayChips, WEEKDAYS } from "./day-chips";

const meta: Meta<typeof DayChips> = {
  title: "DayChips",
  component: DayChips,
};
export default meta;

type Story = StoryObj<typeof DayChips>;

/** The onboarding availability picker, controlled via `useState`. Weekends pre-selected. */
export const Default: Story = {
  render: () => {
    const [days, setDays] = React.useState<string[]>(["Sat", "Sun"]);
    return <DayChips value={days} onChange={setDays} />;
  },
};

/** Nothing selected yet. */
export const NoneSelected: Story = {
  render: () => {
    const [days, setDays] = React.useState<string[]>([]);
    return <DayChips value={days} onChange={setDays} />;
  },
};

/** Every weekday selected. */
export const AllSelected: Story = {
  render: () => {
    const [days, setDays] = React.useState<string[]>([...WEEKDAYS]);
    return <DayChips value={days} onChange={setDays} />;
  },
};

/** A custom day set — a weekday-evenings phone bank. */
export const CustomDays: Story = {
  render: () => {
    const [days, setDays] = React.useState<string[]>(["Tue", "Thu"]);
    return <DayChips days={["Mon", "Tue", "Wed", "Thu", "Fri"]} value={days} onChange={setDays} />;
  },
};
