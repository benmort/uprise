import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { TurnstileWidget, type TurnstileHandle } from "./turnstile-widget";

/**
 * Cloudflare Turnstile — invisible, execute-on-submit CAPTCHA.
 *
 * CAVEAT: this component renders nothing unless a site key is present on
 * `window.__TURNSTILE_SITE_KEY__`, and even then it fetches the Cloudflare
 * challenge script over the network and mints tokens against Cloudflare. It cannot
 * render a meaningful UI statically, so these stories document the placeholder /
 * imperative API only — the widget itself will be a no-op in Storybook. Expect this
 * component to be skipped in the design-system sync.
 */
const meta: Meta<typeof TurnstileWidget> = {
  title: "TurnstileWidget",
  component: TurnstileWidget,
};
export default meta;

type Story = StoryObj<typeof TurnstileWidget>;

/**
 * Unconfigured (no site key): the widget renders nothing and `execute()` resolves to
 * null, so forms fail open in local/unconfigured envs. This is the static default.
 */
export const Unconfigured: Story = {
  render: () => {
    const ref = React.useRef<TurnstileHandle>(null);
    const [token, setToken] = React.useState<string | null | "pending">("pending");
    return (
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-muted-foreground">
          No site key configured — the widget below renders nothing and{" "}
          <code>execute()</code> resolves to <code>null</code>.
        </p>
        <TurnstileWidget ref={ref} />
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm"
          onClick={async () => setToken((await ref.current?.execute()) ?? null)}
        >
          Call execute()
        </button>
        <p className="text-xs text-muted-foreground">
          Result: {token === "pending" ? "—" : String(token)}
        </p>
      </div>
    );
  },
};
