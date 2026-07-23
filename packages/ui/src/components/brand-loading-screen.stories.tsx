import type { Meta, StoryObj } from "@storybook/react";
import { BrandLoadingScreen } from "./brand-loading-screen";

const meta: Meta<typeof BrandLoadingScreen> = {
  title: "BrandLoadingScreen",
  component: BrandLoadingScreen,
};
export default meta;
type Story = StoryObj<typeof BrandLoadingScreen>;

export const Default: Story = { args: { message: "Loading your workspace…" } };
export const WithTenant: Story = { args: { name: "GetUp", message: "Setting things up…" } };
