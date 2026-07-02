import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { FieldOnboarding } from "./field-onboarding";

/**
 * First-run 60-second how-to + safety primer for volunteers. It shows once per device
 * via the localStorage key `uprise.fieldOnboarded`, so these stories clear that key on
 * mount to force the carousel to appear.
 */
const meta: Meta<typeof FieldOnboarding> = {
  title: "FieldOnboarding",
  component: FieldOnboarding,
};
export default meta;

type Story = StoryObj<typeof FieldOnboarding>;

/** Force the "not yet seen" state, then render the carousel overlay. */
function Fresh({ onDone }: { onDone?: () => void }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    try {
      window.localStorage.removeItem("uprise.fieldOnboarded");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);
  // Remount on each show so the internal `seen`/`step` state resets.
  return ready ? <FieldOnboarding key={String(ready)} onDone={onDone} /> : null;
}

export const Default: Story = {
  render: () => <Fresh />,
};

export const WithOnDone: Story = {
  render: () => {
    const [done, setDone] = React.useState(false);
    return (
      <div className="min-h-[28rem]">
        {done ? (
          <p className="p-4 text-sm text-muted-foreground">Onboarding dismissed — onDone fired.</p>
        ) : (
          <Fresh onDone={() => setDone(true)} />
        )}
      </div>
    );
  },
};
