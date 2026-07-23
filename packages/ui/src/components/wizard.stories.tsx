import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Wizard } from "./wizard";

const meta: Meta<typeof Wizard> = {
  title: "Wizard",
  component: Wizard,
  decorators: [(Story) => <div className="w-[32rem]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Wizard>;

export const Default: Story = {
  render: () => {
    function Demo() {
      const [done, setDone] = useState(false);
      return done ? (
        <p className="text-sm text-success">Complete!</p>
      ) : (
        <Wizard
          onComplete={() => setDone(true)}
          steps={[
            { key: "details", label: "Details", content: <p className="text-sm text-muted-foreground">Event details.</p> },
            { key: "audience", label: "Audience", content: <p className="text-sm text-muted-foreground">Who to invite.</p> },
            { key: "review", label: "Review", content: <p className="text-sm text-muted-foreground">Confirm and publish.</p> },
          ]}
        />
      );
    }
    return <Demo />;
  },
};
