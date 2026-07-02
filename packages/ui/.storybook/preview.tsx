import * as React from "react";
import type { Preview } from "@storybook/react";
import "./preview.css";
import { ToastProvider } from "../src/index";

/**
 * All stories render inside ToastProvider (harmless for components that don't use
 * toasts; required for those that do) and on the design system's default light
 * surface, so previews match the real app chrome.
 */
const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
    backgrounds: { default: "surface", values: [{ name: "surface", value: "#ffffff" }] },
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="text-foreground">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
};

export default preview;
