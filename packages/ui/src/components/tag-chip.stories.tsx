import type { Meta, StoryObj } from "@storybook/react";
import { TagChip } from "./tag-chip";

const meta: Meta<typeof TagChip> = {
  title: "TagChip",
  component: TagChip,
};
export default meta;

type Story = StoryObj<typeof TagChip>;

/** A plain, non-interactive tag — renders as a `span` (contact audience labels). */
export const Default: Story = { args: { label: "Renters" } };

/** With an `onClick` it renders as a `button` and gains a hover state. */
export const Clickable: Story = {
  args: { label: "Volunteers", onClick: () => {} },
};

/** A draggable merge tag — dropped into a message template in the blast composer. */
export const MergeTag: Story = {
  args: { label: "{{first_name}}", onDragStart: () => {} },
};

/** Audience tags as they appear on a contact profile. */
export const AudienceTags: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {["Renters", "Newtown ward", "Door-knocked", "Committed voters", "New arrivals"].map(
        (label) => (
          <TagChip key={label} label={label} />
        ),
      )}
    </div>
  ),
};

/** The merge-tag palette an organiser drags into an SMS body. */
export const MergeTagPalette: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {["{{first_name}}", "{{last_name}}", "{{suburb}}", "{{polling_place}}", "{{event_date}}"].map(
        (label) => (
          <TagChip key={label} label={label} onDragStart={() => {}} />
        ),
      )}
    </div>
  ),
};
