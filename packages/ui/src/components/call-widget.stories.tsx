import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { CallWidget } from "./call-widget";

/**
 * The click-to-call widget — pure, props-driven screens shared by the public
 * action page, the sandboxed embed iframe and the web-component loader. The
 * effectful container feeds a `screen` in and receives intents (start / DTMF
 * digit / hang up) out; every in-call sub-screen mirrors the phone IVR.
 */
const meta: Meta<typeof CallWidget> = {
  title: "CallWidget",
  component: CallWidget,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CallWidget>;

const COPY = {
  headline: "Tell your MP: fund the safety net",
  body: "Calls go straight from your browser to your local member's office. We'll find the right office from your postcode.",
  ctaLabel: "Call my MP",
  targetLabel: "your local representative",
};

export const Idle: Story = {
  render: () => {
    const [values, setValues] = React.useState({ name: "", email: "", phone: "" });
    return (
      <CallWidget
        screen={{ kind: "idle" }}
        {...COPY}
        fields={{ collectName: true, collectEmail: true }}
        values={values}
        onValuesChange={setValues}
        onStart={() => {}}
      />
    );
  },
};

export const Creating: Story = {
  args: { screen: { kind: "creating" }, ...COPY, fields: { collectName: true } },
};

export const Connecting: Story = {
  args: { screen: { kind: "connecting" }, ...COPY },
};

export const InCallPostcode: Story = {
  args: {
    screen: { kind: "in-call", view: { kind: "postcode" } },
    ...COPY,
    typedDigits: "30",
    onDigit: () => {},
    onHangUp: () => {},
  },
};

export const InCallDistricts: Story = {
  args: {
    screen: { kind: "in-call", view: { kind: "districts", options: ["Wills", "Cooper"] } },
    ...COPY,
    onDigit: () => {},
    onHangUp: () => {},
  },
};

export const InCallSurvey: Story = {
  args: {
    screen: {
      kind: "in-call",
      view: {
        kind: "survey",
        question: "Do you support raising the rate?",
        options: [
          { digit: "1", label: "Yes" },
          { digit: "2", label: "No" },
          { digit: "3", label: "Unsure" },
        ],
      },
    },
    ...COPY,
    onDigit: () => {},
    onHangUp: () => {},
  },
};

export const InCallConnected: Story = {
  args: {
    screen: {
      kind: "in-call",
      view: {
        kind: "connected",
        name: "Alex Example MP",
        target: {
          name: "Alex Example MP",
          party: "Australian Labor Party",
          electorate: "Wills",
          imageUrl: null,
          imageCredit: null,
        },
      },
    },
    ...COPY,
    onHangUp: () => {},
    onToggleMute: () => {},
  },
};

export const TargetGone: Story = {
  args: {
    screen: { kind: "in-call", view: { kind: "target-gone" } },
    ...COPY,
    onHangUp: () => {},
  },
};

export const Ended: Story = {
  args: {
    screen: { kind: "ended", message: "Thanks for calling — every conversation counts." },
    ...COPY,
    onRetry: () => {},
  },
};

export const ErrorMicDenied: Story = {
  args: {
    screen: {
      kind: "error",
      message: "We couldn't access your microphone.",
      micDenied: true,
      canRetry: true,
    },
    ...COPY,
    fullPageUrl: "https://action.uprise.org.au/example/actions/abc123",
    onRetry: () => {},
  },
};
