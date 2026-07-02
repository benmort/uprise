import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { ToastProvider, useToast } from "./toast";
import { Button } from "./button";

/**
 * Transient notifications. The provider is already mounted globally in
 * `.storybook/preview`, so stories consume the `useToast` hook directly. Toasts are
 * pushed on click and stack bottom-right, so a static/first-frame render shows only
 * the trigger buttons – click one to see the toast.
 */
const meta: Meta<typeof ToastProvider> = { title: "ToastProvider", component: ToastProvider };
export default meta;
type Story = StoryObj<typeof ToastProvider>;

/** Fires one toast per tone – click to see each style. */
export const Tones: Story = {
  render: () => {
    const { showToast } = useToast();
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="success"
          onClick={() =>
            showToast({ tone: "success", title: "Blast sent", description: "1,204 messages queued." })
          }
        >
          Success
        </Button>
        <Button
          variant="destructive"
          onClick={() =>
            showToast({ tone: "error", title: "Couldn't send", description: "Twilio rejected the request." })
          }
        >
          Error
        </Button>
        <Button
          variant="warning"
          onClick={() =>
            showToast({ tone: "warning", title: "Approval pending", description: "Awaiting an organiser." })
          }
        >
          Warning
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            showToast({ tone: "info", title: "Draft saved", description: "Autosaved just now." })
          }
        >
          Info
        </Button>
      </div>
    );
  },
};

/** Toast with a single follow-up action. */
export const WithAction: Story = {
  render: () => {
    const { showToast } = useToast();
    return (
      <Button
        onClick={() =>
          showToast({
            tone: "success",
            title: "Member removed",
            description: "Priya Nair no longer has access.",
            action: { label: "Undo", onClick: () => {} },
          })
        }
      >
        Remove member
      </Button>
    );
  },
};

/** Toast offering several actions. */
export const WithActions: Story = {
  render: () => {
    const { showToast } = useToast();
    return (
      <Button
        onClick={() =>
          showToast({
            tone: "info",
            title: "New reply in shared inbox",
            description: "From a supporter in Wentworth.",
            actions: [
              { label: "Open", onClick: () => {} },
              { label: "Assign to me", onClick: () => {} },
              { label: "Dismiss", onClick: () => {} },
            ],
          })
        }
      >
        Simulate inbox reply
      </Button>
    );
  },
};

/** Persistent toast (durationMs: 0) that stays until dismissed. */
export const Persistent: Story = {
  render: () => {
    const { showToast } = useToast();
    return (
      <Button
        variant="destructive"
        onClick={() =>
          showToast({
            tone: "error",
            title: "Queue stalled",
            description: "The outbox relay hasn't drained in 5 minutes.",
            durationMs: 0,
          })
        }
      >
        Raise incident
      </Button>
    );
  },
};
