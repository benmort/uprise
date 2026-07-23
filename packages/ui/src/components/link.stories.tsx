import type { Meta, StoryObj } from "@storybook/react";
import { Link } from "./link";

const meta: Meta<typeof Link> = {
  title: "Link",
  component: Link,
  args: { href: "#", children: "View details" },
};
export default meta;
type Story = StoryObj<typeof Link>;

export const Default: Story = {};
export const Muted: Story = { args: { variant: "muted", children: "Muted link" } };

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Link href="#">Default link</Link>
      <Link href="#" variant="muted">
        Muted link
      </Link>
    </div>
  ),
};
