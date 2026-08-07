import type { Meta, StoryObj } from "@storybook/react";
import { RefreshButton } from "./refresh-button";

const meta: Meta<typeof RefreshButton> = {
  title: "RefreshButton",
  component: RefreshButton,
};
export default meta;

type Story = StoryObj<typeof RefreshButton>;

export const Basic: Story = {
  args: {},
};

/** In flight — spins and disables. */
export const Refreshing: Story = {
  args: { refreshing: true },
};

export const IconOnly: Story = {
  args: { iconOnly: true },
};
