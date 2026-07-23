import type { Meta, StoryObj } from "@storybook/react";
import { List, ListItem } from "./list";

const meta: Meta<typeof List> = {
  title: "List",
  component: List,
};
export default meta;
type Story = StoryObj<typeof List>;

export const Plain: Story = {
  render: () => (
    <List className="w-64">
      <ListItem>First item</ListItem>
      <ListItem>Second item</ListItem>
      <ListItem>Third item</ListItem>
    </List>
  ),
};

export const Divided: Story = {
  render: () => (
    <List variant="divided" className="w-64">
      <ListItem>First item</ListItem>
      <ListItem>Second item</ListItem>
      <ListItem>Third item</ListItem>
    </List>
  ),
};
