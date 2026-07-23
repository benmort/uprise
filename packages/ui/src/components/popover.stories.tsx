import type { Meta, StoryObj } from "@storybook/react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";

const meta: Meta<typeof Popover> = {
  title: "Popover",
  component: Popover,
};
export default meta;
type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-sm font-semibold text-foreground">Anchored panel</p>
        <p className="mt-1 text-sm text-muted-foreground">Dismisses on outside-click or Escape.</p>
      </PopoverContent>
    </Popover>
  ),
};
