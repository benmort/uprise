import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardHeader, CardTitle, CardContent } from "./card";
import { Button } from "./button";

const meta: Meta<typeof Card> = { title: "Card", component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-[380px]">
      <CardHeader>
        <CardTitle>Command centre</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Everything across Uprise — messaging, conversations, audiences and the field.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-[380px]">
      <CardHeader>
        <CardTitle>Delete tenant</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">This permanently removes the workspace and its data.</p>
        <Button variant="destructive">Delete</Button>
      </CardContent>
    </Card>
  ),
};
