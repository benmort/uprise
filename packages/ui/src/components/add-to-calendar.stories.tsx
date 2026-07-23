import type { Meta, StoryObj } from "@storybook/react";
import { AddToCalendar } from "./add-to-calendar";

const meta: Meta<typeof AddToCalendar> = {
  title: "AddToCalendar",
  component: AddToCalendar,
  args: {
    event: {
      title: "Doorknock — Richmond",
      description: "Meet at the community hall.",
      location: "Richmond Town Hall",
      startsAt: "2026-08-01T09:00:00.000Z",
      endsAt: "2026-08-01T12:00:00.000Z",
      url: "https://uprise.org.au/events/richmond",
    },
  },
};
export default meta;
type Story = StoryObj<typeof AddToCalendar>;

export const Default: Story = {};
