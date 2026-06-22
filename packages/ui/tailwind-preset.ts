/**
 * Shared Tailwind theme preset (meld doc 14) — the colour/radius/font tokens the
 * @yarns/ui design system uses. Consuming apps add it via `presets: [yarnsUiPreset]`
 * and pair it with `@yarns/ui/globals.css` (the CSS variable definitions). Typed
 * loosely so the package needn't depend on tailwindcss.
 */
const yarnsUiPreset = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        "surface-variant": "hsl(var(--surface-variant))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--on-primary))",
          container: "hsl(var(--primary-container))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--on-secondary))",
          container: "hsl(var(--secondary-container))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--on-error))",
          container: "hsl(var(--error-container))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--on-success))",
          container: "hsl(var(--success-container))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning-foreground))",
          foreground: "hsl(var(--warning-foreground))",
          container: "hsl(var(--warning-container))",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      fontFamily: {
        headline: ["var(--font-roboto)", "sans-serif"],
        body: ["var(--font-roboto)", "sans-serif"],
        label: ["var(--font-roboto)", "sans-serif"],
      },
      spacing: {
        18: "4.5rem",
      },
      maxWidth: {
        page: "80rem",
      },
    },
  },
  plugins: [],
};

export default yarnsUiPreset;
