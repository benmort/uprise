import type { Meta, StoryObj } from "@storybook/react";
import { ButtonGroup } from "./button-group";
import { Button } from "./button";

const meta: Meta<typeof ButtonGroup> = {
  title: "ButtonGroup",
  component: ButtonGroup,
};
export default meta;
type Story = StoryObj<typeof ButtonGroup>;

export const Default: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Day</Button>
      <Button variant="outline">Week</Button>
      <Button variant="outline">Month</Button>
    </ButtonGroup>
  ),
};
