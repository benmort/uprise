import type { Meta, StoryObj } from "@storybook/react";
import { Avatar } from "./avatar";

const meta: Meta<typeof Avatar> = {
  title: "Avatar",
  component: Avatar,
};
export default meta;

type Story = StoryObj<typeof Avatar>;

/** No image → initials fallback computed from the name (first + last). */
export const Initials: Story = { args: { name: "Priya Sharma" } };

/** A real photo; falls back to initials if the image fails to load. */
export const WithImage: Story = {
  args: {
    name: "Marcus Lee",
    src: "https://i.pravatar.cc/80?img=12",
  },
};

/** Single-word and email names still resolve to sensible initials. */
export const InitialsGallery: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      {["Priya Sharma", "marcus.lee@uprise.org.au", "Jo", "Aisha Okafor Bello", ""].map(
        (name, i) => (
          <Avatar key={i} name={name} />
        ),
      )}
    </div>
  ),
};

/** The default is `h-10 w-10`; override via `className` for topbar, list and hero sizes. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar name="Priya Sharma" className="h-8 w-8 text-xs" />
      <Avatar name="Priya Sharma" />
      <Avatar name="Priya Sharma" className="h-14 w-14 text-lg" />
      <Avatar name="Priya Sharma" className="h-20 w-20 text-2xl" />
    </div>
  ),
};
