import { redirect } from "next/navigation";

// The tabbed General settings moved to real per-tab URLs under /settings/[section]
// (the shell lives in ./general-settings). This legacy path keeps old bookmarks and
// links working by bouncing to the first tab.
export default function TenantSettingsRedirect() {
  redirect("/settings/tenant");
}
