import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Reveal } from "./reveal";
import { Card } from "./card";

/**
 * Scroll-triggered entrance (fade + rise) used on the marketing surfaces.
 * Static previews show the settled (revealed) state; the motion itself is an
 * in-browser behaviour.
 */
const meta: Meta<typeof Reveal> = {
  title: "Reveal",
  component: Reveal,
};
export default meta;

type Story = StoryObj<typeof Reveal>;

export const Staggered: Story = {
  render: () => (
    <div className="w-80 space-y-3">
      {["First in", "Second, 150ms later", "Third, 300ms later"].map((label, index) => (
        <Reveal key={label} delay={index * 150}>
          <Card className="p-4 text-sm text-foreground">{label}</Card>
        </Reveal>
      ))}
    </div>
  ),
};
