import type { Meta, StoryObj } from "@storybook/react";
import { QrCode } from "./qr-code";

const meta: Meta<typeof QrCode> = {
  title: "QrCode",
  component: QrCode,
  args: { value: "https://uprise.org.au" },
};
export default meta;
type Story = StoryObj<typeof QrCode>;

export const Default: Story = {};
export const PreviewOnly: Story = { args: { hideActions: true, size: 120 } };
