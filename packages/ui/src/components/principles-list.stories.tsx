import type { Meta, StoryObj } from "@storybook/react";
import { Handshake, MapPin, ShieldCheck } from "lucide-react";
import { PrinciplesList, CANVASSER_PRINCIPLES, type Principle } from "./principles-list";

const meta: Meta<typeof PrinciplesList> = {
  title: "PrinciplesList",
  component: PrinciplesList,
};
export default meta;

type Story = StoryObj<typeof PrinciplesList>;

/** With no `items`, it renders the three canvasser principles (invite landing page). */
export const Default: Story = {};

/** `boxed` wraps each row in a bordered card — the onboarding conduct step. */
export const Boxed: Story = { args: { boxed: true } };

/** The shared canvasser principles passed explicitly. */
export const CanvasserPrinciples: Story = {
  args: { items: CANVASSER_PRINCIPLES },
};

/** Custom items — a phone-banking variant with its own icons and tones. */
export const CustomItems: Story = {
  render: () => {
    const items: Principle[] = [
      {
        icon: ShieldCheck,
        tone: "success",
        title: "Verify before you dial",
        body: "Confirm you're calling the right list and honour every do-not-call flag.",
      },
      {
        icon: Handshake,
        tone: "primary",
        title: "Lead with the ask",
        body: "Open warmly, make the ask clearly, and log the response.",
      },
      {
        icon: MapPin,
        tone: "knock",
        title: "Note the follow-up",
        body: "Flag anyone who wants a call back so the team can pick it up.",
      },
    ];
    return <PrinciplesList items={items} boxed />;
  },
};
