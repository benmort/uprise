import type { Meta, StoryObj } from "@storybook/react";
import { Spinner, PageSpinner } from "./spinner";
import { Button } from "./button";

const meta: Meta<typeof Spinner> = { title: "Spinner", component: Spinner };
export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-muted-foreground">
      <Spinner />
      <Spinner className="h-6 w-6" />
      <Spinner className="h-8 w-8" />
    </div>
  ),
};

export const InButton: Story = {
  render: () => (
    <Button disabled>
      <Spinner className="mr-2" />
      Saving…
    </Button>
  ),
};

export const Page: Story = {
  render: () => (
    <div className="w-[420px]">
      <PageSpinner label="Loading dashboard…" />
    </div>
  ),
};
