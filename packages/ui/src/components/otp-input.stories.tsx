import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { OtpInput } from "./otp-input";

const meta: Meta<typeof OtpInput> = {
  title: "OtpInput",
  component: OtpInput,
};
export default meta;

type Story = StoryObj<typeof OtpInput>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState("123456");
    return (
      <div className="max-w-sm">
        <OtpInput value={value} onChange={setValue} length={6} />
      </div>
    );
  },
};

export const Empty: Story = {
  render: () => {
    const [value, setValue] = React.useState("");
    return (
      <div className="max-w-sm">
        <OtpInput value={value} onChange={setValue} length={6} />
      </div>
    );
  },
};

export const PartiallyFilled: Story = {
  render: () => {
    const [value, setValue] = React.useState("123");
    return (
      <div className="max-w-sm">
        <OtpInput value={value} onChange={setValue} length={6} />
      </div>
    );
  },
};

export const FourDigit: Story = {
  render: () => {
    const [value, setValue] = React.useState("1234");
    return (
      <div className="max-w-xs">
        <OtpInput value={value} onChange={setValue} length={4} />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => {
    const [value, setValue] = React.useState("123456");
    return (
      <div className="max-w-sm">
        <OtpInput value={value} onChange={setValue} length={6} disabled />
      </div>
    );
  },
};

export const WithOnComplete: Story = {
  render: () => {
    const [value, setValue] = React.useState("");
    const [done, setDone] = React.useState<string | null>(null);
    return (
      <div className="max-w-sm space-y-2">
        <OtpInput value={value} onChange={setValue} length={6} onComplete={setDone} />
        <p className="text-xs text-muted-foreground">
          {done ? `Completed: ${done}` : "Enter all 6 digits to fire onComplete."}
        </p>
      </div>
    );
  },
};
