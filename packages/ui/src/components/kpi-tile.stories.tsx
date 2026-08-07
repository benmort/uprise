import type { Meta, StoryObj } from "@storybook/react";
import { DoorOpen } from "lucide-react";
import { KpiTile } from "./kpi-tile";

const meta: Meta<typeof KpiTile> = {
  title: "KpiTile",
  component: KpiTile,
};
export default meta;

type Story = StoryObj<typeof KpiTile>;

export const Basic: Story = {
  args: { label: "Doors knocked", value: "1,204" },
};

export const WithDelta: Story = {
  args: {
    label: "Conversations",
    value: "312",
    delta: { value: "+12% vs last week", direction: "up" },
    icon: <DoorOpen className="h-4 w-4" />,
  },
};

/** The three scales — `lg` is the field/canvass default; `md` is the dashboard's. */
export const Sizes: Story = {
  render: () => (
    <div className="grid w-[520px] grid-cols-3 gap-3">
      <KpiTile label="sm" value="42" size="sm" />
      <KpiTile label="md" value="42" size="md" />
      <KpiTile label="lg" value="42" size="lg" />
    </div>
  ),
};

export const WithCaption: Story = {
  args: { label: "Realistic doors", value: "59", caption: "of an 86-door ceiling" },
};
