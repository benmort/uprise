import type { Meta, StoryObj } from "@storybook/react";
import { CapacityMeter } from "./capacity-meter";

const meta: Meta<typeof CapacityMeter> = {
  title: "CapacityMeter",
  component: CapacityMeter,
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof CapacityMeter>;

export const SpotsLeft: Story = { args: { going: 12, capacity: 50 } };
export const WithWaitlist: Story = { args: { going: 50, waitlist: 8, capacity: 50 } };
export const Unbounded: Story = { args: { going: 24, capacity: null } };
