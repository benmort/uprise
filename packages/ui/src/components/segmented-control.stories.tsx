import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SegmentedControl } from "./segmented-control";

const meta: Meta<typeof SegmentedControl> = {
  title: "SegmentedControl",
  component: SegmentedControl,
};
export default meta;
type Story = StoryObj<typeof SegmentedControl>;

export const Default: Story = {
  render: () => {
    function Demo() {
      const [value, setValue] = useState("week");
      return (
        <SegmentedControl
          value={value}
          onChange={setValue}
          aria-label="Range"
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />
      );
    }
    return <Demo />;
  },
};

export const Fluid: Story = {
  render: () => {
    function Demo() {
      const [value, setValue] = useState("all");
      return (
        <div className="w-80">
          <SegmentedControl
            value={value}
            onChange={setValue}
            fluid
            aria-label="Filter"
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
            ]}
          />
        </div>
      );
    }
    return <Demo />;
  },
};
