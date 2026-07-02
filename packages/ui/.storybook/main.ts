import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * Storybook for the @uprise/ui design system. React + Vite. Tailwind v4 is wired via
 * the @tailwindcss/vite plugin so preview.css's `@import "tailwindcss"` + the design
 * tokens (`@uprise/ui/globals.css`) compile exactly as the apps consume them.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
  viteFinal: async (cfg) => {
    cfg.plugins = cfg.plugins ?? [];
    cfg.plugins.push(tailwindcss());
    return cfg;
  },
};

export default config;
