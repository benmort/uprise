import type { Meta, StoryObj } from "@storybook/react";
import { Globe, Plug } from "lucide-react";
import { EntityRow } from "./entity-row";
import { Badge } from "./badge";
import { Button } from "./button";

const meta: Meta<typeof EntityRow> = {
  title: "EntityRow",
  component: EntityRow,
};
export default meta;

type Story = StoryObj<typeof EntityRow>;

export const Basic: Story = {
  args: {
    icon: <Plug className="h-4 w-4" />,
    title: "NationBuilder",
    meta: "demo-nation · connected 3 May 2026",
    trailing: <Badge variant="success" dot>Connected</Badge>,
  },
};

export const WithActions: Story = {
  args: {
    icon: <Globe className="h-4 w-4" />,
    title: "uprise.org.au",
    meta: "Primary domain",
    trailing: (
      <>
        <Badge variant="neutral">Verified</Badge>
        <Button size="sm" variant="outline">Manage</Button>
      </>
    ),
  },
};

/** `asChild` keeps a clickable row a real `<button>` — keyboard + a11y intact. */
export const AsButton: Story = {
  render: () => (
    <EntityRow
      asChild
      icon={<Plug className="h-4 w-4" />}
      title="Action Network"
      meta="Click to open"
      trailing={<Badge>Open</Badge>}
      className="cursor-pointer transition-colors hover:bg-surface-variant"
    >
      <button type="button" onClick={() => {}} />
    </EntityRow>
  ),
};
