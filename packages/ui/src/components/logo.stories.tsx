import type { Meta, StoryObj } from "@storybook/react";
import { Logo, LogoMark } from "./logo";

/**
 * Uprise wordmark (`Logo`) and app mark (`LogoMark`). Both are self-contained SVG/text
 * so they stay crisp at any size. `LogoMark` uses `currentColor` for the block – set it
 * with a `text-*` class.
 */
const meta: Meta<typeof Logo> = { title: "Logo", component: Logo };
export default meta;
type Story = StoryObj<typeof Logo>;

/** Default wordmark (sidebar size). */
export const Default: Story = { render: () => <Logo /> };

/** Large wordmark (login screen). */
export const Large: Story = { render: () => <Logo large /> };

/** The "U" app mark, tinted with the brand primary. */
export const Mark: Story = {
  render: () => <LogoMark className="h-10 w-10 text-primary" />,
};

/** Mark rendered at a range of sizes. */
export const MarkSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4 text-primary">
      <LogoMark className="h-6 w-6" />
      <LogoMark className="h-8 w-8" />
      <LogoMark className="h-12 w-12" />
      <LogoMark className="h-16 w-16" />
    </div>
  ),
};

/** Wordmark and mark together, as they appear in app chrome. */
export const Lockup: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <LogoMark className="h-8 w-8 text-primary" />
      <Logo />
    </div>
  ),
};
