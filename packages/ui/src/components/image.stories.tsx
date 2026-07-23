import type { Meta, StoryObj } from "@storybook/react";
import { Image } from "./image";

// A tiny inline SVG so the story needs no network.
const SAMPLE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="%23465fff"/></svg>',
  );

const meta: Meta<typeof Image> = {
  title: "Image",
  component: Image,
  args: { src: SAMPLE, alt: "Sample", className: "h-24 w-24" },
};
export default meta;
type Story = StoryObj<typeof Image>;

export const Default: Story = {};
export const Rounded: Story = { args: { rounded: "lg" } };
export const Circle: Story = { args: { rounded: "full", ratio: "square" } };
export const Fallback: Story = {
  args: { src: "https://invalid.example/nope.png", fallbackSrc: SAMPLE },
};

export const Ratios: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <Image src={SAMPLE} alt="" ratio="square" className="w-24" />
      <Image src={SAMPLE} alt="" ratio="video" className="w-40" />
      <Image src={SAMPLE} alt="" ratio="4/3" className="w-32" />
    </div>
  ),
};
