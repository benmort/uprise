import type { Meta, StoryObj } from "@storybook/react";
import { TenantAvatar, TenantBrand } from "./tenant-brand";

/**
 * Static tenant brand read-out (gradient avatar + name + optional plan pill) – the
 * tenant-switcher visual without the dropdown. `TenantAvatar` is the standalone
 * gradient disc, keyed on a stable `seed` (tenant id or name).
 */
const meta: Meta<typeof TenantBrand> = { title: "TenantBrand", component: TenantBrand };
export default meta;
type Story = StoryObj<typeof TenantBrand>;

export const Default: Story = { args: { name: "GetUp" } };

export const WithPlan: Story = { args: { name: "GetUp", plan: "scale" } };

/** Seed differs from the name, so the gradient is stable across renames. */
export const SeededById: Story = {
  args: { name: "Australian Conservation Foundation", seed: "ten_9f3a2c", plan: "growth" },
};

export const LongName: Story = {
  render: () => (
    <div className="w-56">
      <TenantBrand name="Rising Tide – Newcastle Chapter Coordinating Committee" plan="free" />
    </div>
  ),
};

/** Several tenants stacked, as in a switcher list. */
export const Roster: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <TenantBrand name="GetUp" plan="scale" />
      <TenantBrand name="Australian Conservation Foundation" plan="growth" />
      <TenantBrand name="Rising Tide" />
    </div>
  ),
};

/** The gradient avatar on its own, at a few sizes. */
export const Avatars: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <TenantAvatar seed="GetUp" className="h-6 w-6" />
      <TenantAvatar seed="Australian Conservation Foundation" className="h-9 w-9" />
      <TenantAvatar seed="Rising Tide" className="h-12 w-12" />
    </div>
  ),
};
