import type { Meta, StoryObj } from "@storybook/react";
import { Inbox, MessageSquareText, PlusCircle, Users } from "lucide-react";
import { QuickActions } from "./quick-actions";

const meta: Meta<typeof QuickActions> = {
  title: "QuickActions",
  component: QuickActions,
};
export default meta;

type Story = StoryObj<typeof QuickActions>;

/** The dashboard launchpad — a primary action plus outline shortcuts. */
export const Default: Story = {
  args: {
    actions: [
      {
        key: "new-conversation",
        label: "New conversation",
        icon: <PlusCircle className="h-4 w-4" />,
        onClick: () => {},
      },
      {
        key: "new-whatsapp",
        label: "New WhatsApp blast",
        icon: <MessageSquareText className="h-4 w-4" />,
        variant: "outline",
        onClick: () => {},
      },
      { key: "inbox", label: "Open inbox", variant: "outline", onClick: () => {} },
      { key: "audience", label: "New audience", variant: "outline", onClick: () => {} },
    ],
  },
};

/** `href` actions render as plain anchors — used for deep-links from marketing into the admin app. */
export const AsLinks: Story = {
  args: {
    actions: [
      {
        key: "inbox",
        label: "Open inbox",
        icon: <Inbox className="h-4 w-4" />,
        href: "/inbox",
      },
      {
        key: "audiences",
        label: "Audiences",
        icon: <Users className="h-4 w-4" />,
        variant: "outline",
        href: "/audience",
      },
    ],
  },
};

/** A disabled action, e.g. while a blast is being created. */
export const WithDisabled: Story = {
  args: {
    actions: [
      {
        key: "new-conversation",
        label: "Creating…",
        icon: <PlusCircle className="h-4 w-4" />,
        disabled: true,
        onClick: () => {},
      },
      { key: "inbox", label: "Open inbox", variant: "outline", onClick: () => {} },
    ],
  },
};

/** A single primary action. */
export const Single: Story = {
  args: {
    actions: [{ key: "new-audience", label: "New audience", onClick: () => {} }],
  },
};
