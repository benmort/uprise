import type { Meta, StoryObj } from "@storybook/react";
import { MicroLabel } from "./micro-label";

const meta: Meta<typeof MicroLabel> = {
  title: "MicroLabel",
  component: MicroLabel,
};
export default meta;

type Story = StoryObj<typeof MicroLabel>;

export const Basic: Story = {
  args: { children: "Section eyebrow" },
};

export const AsParagraph: Story = {
  args: { as: "p", children: "Prototype" },
};
