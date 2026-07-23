import type { Meta, StoryObj } from "@storybook/react";
import { ShareCard } from "./share-card";

const meta: Meta<typeof ShareCard> = {
  title: "ShareCard",
  component: ShareCard,
  args: { url: "https://uprise.org.au/events/richmond", title: "Doorknock — Richmond" },
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof ShareCard>;

export const Default: Story = {};
export const WithQr: Story = { args: { qr: true } };
