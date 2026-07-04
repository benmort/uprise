import { redirect } from "next/navigation";

// Settings consolidated into the tabbed General page (organisation + branding + business +
// contacts + addresses + tenant & access + alerts + feature flags + queue). The former
// standalone cards now live there as tabs (see components/settings/observability).
export default function SettingsPage() {
  redirect("/future/tenant-settings");
}
