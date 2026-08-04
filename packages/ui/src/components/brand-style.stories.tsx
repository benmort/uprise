import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { BrandStyle } from "./brand-style";
import { Button } from "./button";
import { Card } from "./card";

/**
 * Tenant brand theming for public/embedded surfaces (poll viewer, action
 * pages, the click-to-call widget). Emits one sanitised `<style>` mapping the
 * tenant's colours onto the design-system tokens — everything inside the
 * wrapper re-themes; nothing outside it is touched.
 */
const meta: Meta<typeof BrandStyle> = {
  title: "BrandStyle",
  component: BrandStyle,
};
export default meta;

type Story = StoryObj<typeof BrandStyle>;

function Demo() {
  return (
    <Card className="w-72 space-y-3 p-4">
      <p className="text-sm font-semibold text-foreground">Stand with us</p>
      <p className="text-xs text-muted-foreground">Buttons and accents pick up the tenant's brand.</p>
      <Button className="w-full">Take action</Button>
    </Card>
  );
}

export const Unbranded: Story = {
  render: () => <Demo />,
};

export const TenantBranded: Story = {
  render: () => (
    <div>
      <BrandStyle brand={{ primaryColour: "#0e7a5f", secondaryColour: "#f59e0b" }} />
      <Demo />
    </div>
  ),
};

export const WithCustomCss: Story = {
  render: () => (
    <div>
      <BrandStyle
        brand={{
          primaryColour: "#7c3aed",
          customCss: ".demo-banner { border-radius: 9999px; letter-spacing: 0.08em; }",
        }}
      />
      <Demo />
    </div>
  ),
};
