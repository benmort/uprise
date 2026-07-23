import type { Meta, StoryObj } from "@storybook/react";
import { Carousel, CarouselItem } from "./carousel";

const meta: Meta<typeof Carousel> = {
  title: "Carousel",
  component: Carousel,
};
export default meta;
type Story = StoryObj<typeof Carousel>;

export const Default: Story = {
  render: () => (
    <Carousel className="w-[32rem]">
      {["One", "Two", "Three", "Four", "Five"].map((s) => (
        <CarouselItem key={s} className="w-64">
          <div className="flex h-28 items-center justify-center rounded-2xl border border-border bg-surface-variant text-sm font-semibold text-foreground">
            Slide {s}
          </div>
        </CarouselItem>
      ))}
    </Carousel>
  ),
};
