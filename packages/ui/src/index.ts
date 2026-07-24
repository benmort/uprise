// @uprise/ui — the shared Radix/Tailwind/CVA design system (meld doc 14), extracted from
// apps/admin so every app renders identically. Consumed as SOURCE via Next `transpilePackages`
// (no build step); Tailwind v4 tokens ship in ./globals.css (CSS-first @theme).
//
// This barrel is the catalogue — grouped by role. Every component is re-exported here (that's
// the public API + what `optimizePackageImports` rewrites). See COMPONENTS.md for the full
// index + the 21-primitive design map. Conventions: kebab files, PascalCase components,
// CVA variants, `cn` for class composition, design tokens only (never a raw hex), a co-located
// `*.stories.tsx` per component. No `next/*` imports live here — link primitives are
// framework-agnostic (`asChild` via Radix Slot).

// ── Utilities ─────────────────────────────────────────────────────────────────
export * from "./lib/utils";

// ── Primitives ──────────────────────────────────────────────────────────────
export * from "./components/button";
export * from "./components/button-group";
export * from "./components/badge";
export * from "./components/avatar";
export * from "./components/image";
export * from "./components/link";
export * from "./components/ribbon";
export * from "./components/logo";
export * from "./components/tag-chip";
export * from "./components/spinner";
export * from "./components/skeleton";

// ── Forms ─────────────────────────────────────────────────────────────────────
export * from "./components/input";
export * from "./components/textarea";
export * from "./components/label";
export * from "./components/select";
export * from "./components/checkbox";
export * from "./components/radio-group";
export * from "./components/switch";
export * from "./components/field";
export * from "./components/field-onboarding";
export * from "./components/form-input";
export * from "./components/form-label";
export * from "./components/form-select";
export * from "./components/form-textarea";
export * from "./components/otp-input";
export * from "./components/password-input";
export * from "./components/phone-input";
// Re-export the phone helpers except `toE164` — the AU-only `phone-number-field` already
// exports that name; PhoneInput uses lib/phone's version internally.
export {
  PHONE_COUNTRIES,
  DEFAULT_PHONE_COUNTRY,
  findPhoneCountry,
  parseE164,
  nationalDisplay,
  formatPhoneDisplay,
  type PhoneCountry,
} from "./lib/phone";
export * from "./components/password-strength";
export * from "./components/phone-number-field";
export * from "./components/keypad";
export * from "./components/day-chips";

// ── Feedback ──────────────────────────────────────────────────────────────────
export * from "./components/alert";
export * from "./components/toast";
export * from "./components/empty-state";
export * from "./components/progress";
export * from "./components/step-progress";
export * from "./components/capacity-meter";
export * from "./components/brand-loading-screen";

// ── Overlays ────────────────────────────────────────────────────────────────
export * from "./components/modal";
export * from "./components/form-dialog";
export * from "./components/confirm-dialog";
export * from "./components/dropdown";
export * from "./components/dropdown-menu";
export * from "./components/popover";
export * from "./components/tooltip";
export * from "./components/tooltip-hint";

// ── Navigation ────────────────────────────────────────────────────────────────
export * from "./components/tabs";
export * from "./components/segmented-control";
export * from "./components/breadcrumb";
export * from "./components/pagination";
export * from "./components/pagination-controls";
export * from "./components/quick-actions";

// ── Data display ──────────────────────────────────────────────────────────────
export * from "./components/card";
export * from "./components/list";
export * from "./components/table";
export * from "./components/carousel";

// ── Domain & status ─────────────────────────────────────────────────────────
export * from "./components/status-badge";
export * from "./components/event-status-badge";
export * from "./components/role-select-cards";
export * from "./components/principles-list";
export * from "./components/share-card";
export * from "./components/add-to-calendar";
export * from "./components/qr-code";
export * from "./components/wizard";

// ── Brand ─────────────────────────────────────────────────────────────────────
export * from "./components/tenant-brand";
export * from "./components/tenant-head";
export * from "./components/brand-style";
export * from "./components/turnstile-widget";

// ── Pure logic (lib) ──────────────────────────────────────────────────────────
export * from "./lib/wizard-steps";
export * from "./lib/brand-css";
export * from "./lib/brand-cookie";
export * from "./lib/readable-on";
export * from "./lib/calendar-links";
export * from "./lib/qr";

// ── Hooks ───────────────────────────────────────────────────────────────────
export * from "./hooks/use-local-storage";
export * from "./hooks/use-countdown";
