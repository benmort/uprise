import type { Config } from "tailwindcss";
import yarnsUiPreset from "@yarns/ui/tailwind-preset";

const config: Config = {
  presets: [yarnsUiPreset as unknown as Partial<Config>],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    // the shared design system (meld doc 14)
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  plugins: [],
};

export default config;
