import type { Meta, StoryObj } from "@storybook/react";
import { CopyButton } from "./copy-button";

const meta: Meta<typeof CopyButton> = {
  title: "CopyButton",
  component: CopyButton,
};
export default meta;

type Story = StoryObj<typeof CopyButton>;

export const Basic: Story = {
  args: { value: "https://uprise.org.au/join" },
};

export const CustomLabels: Story = {
  args: { value: "UP-INVITE-4821", label: "Copy code", copiedLabel: "Code copied" },
};

/** Square icon-only variant — the label becomes the aria-label. */
export const IconOnly: Story = {
  args: { value: "https://uprise.org.au/join", iconOnly: true, label: "Copy link" },
};

/** Lazy value — built at click time (e.g. from window.location). */
export const LazyValue: Story = {
  args: { value: () => `generated at click`, label: "Copy generated" },
};
