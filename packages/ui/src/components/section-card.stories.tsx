import type { Meta, StoryObj } from "@storybook/react";
import { SectionCard } from "./section-card";
import { Button } from "./button";

const meta: Meta<typeof SectionCard> = {
  title: "SectionCard",
  component: SectionCard,
};
export default meta;

type Story = StoryObj<typeof SectionCard>;

export const Basic: Story = {
  args: {
    title: "Turf",
    description: "The areas assigned to this volunteer.",
    children: <p className="text-sm text-muted-foreground">Card content sits in the padded body.</p>,
  },
};

/** The header's action slot — a button cluster pinned to the right of the title row. */
export const WithAction: Story = {
  args: {
    title: "Data sync",
    action: (
      <Button size="sm" variant="outline">
        Sync now
      </Button>
    ),
    children: <p className="text-sm text-muted-foreground">Everything is synced.</p>,
  },
};

/** Headerless — just the surface. `bodyClassName` tunes the padding (e.g. p-0 for tables). */
export const BodyOnly: Story = {
  args: {
    children: <p className="text-sm text-muted-foreground">No title row at all.</p>,
  },
};

/** `id` and data-* forward to the root — tour anchors and e2e hooks ride the card itself. */
export const Anchored: Story = {
  args: {
    id: "tour-example-anchor",
    title: "Anchored card",
    children: <p className="text-sm text-muted-foreground">Inspect: the section carries the id.</p>,
  },
};
