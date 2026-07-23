import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabsContent, TabsList, TabsTrigger, TabNav, TabNavItem } from "./tabs";

const meta: Meta<typeof Tabs> = {
  title: "Tabs",
  component: Tabs,
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Pill: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-96">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="text-sm text-muted-foreground">
        Overview panel.
      </TabsContent>
      <TabsContent value="activity" className="text-sm text-muted-foreground">
        Activity panel.
      </TabsContent>
      <TabsContent value="settings" className="text-sm text-muted-foreground">
        Settings panel.
      </TabsContent>
    </Tabs>
  ),
};

export const Underline: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-96">
      <TabsList variant="underline">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="text-sm text-muted-foreground">
        Overview panel.
      </TabsContent>
      <TabsContent value="activity" className="text-sm text-muted-foreground">
        Activity panel.
      </TabsContent>
    </Tabs>
  ),
};

export const LinkNav: Story = {
  render: () => {
    function Demo() {
      const [tab, setTab] = useState("all");
      return (
        <TabNav>
          {["all", "unread", "flagged"].map((t) => (
            <TabNavItem
              key={t}
              active={tab === t}
              onClick={() => setTab(t)}
              className="cursor-pointer capitalize"
            >
              {t}
            </TabNavItem>
          ))}
        </TabNav>
      );
    }
    return <Demo />;
  },
};
