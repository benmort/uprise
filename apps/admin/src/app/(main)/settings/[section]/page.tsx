import { GeneralSettings } from "@/app/(main)/future/tenant-settings/general-settings";
import { sectionToTab } from "@/app/(main)/future/tenant-settings/sections";

// Real per-tab URLs for General settings: /settings/tenant, /settings/organisation,
// /settings/branding, …/business, …/contacts, …/addresses, …/access, …/integrations,
// …/security, …/compliance, …/alerts, plus …/feature-flags and …/queue (super-admin).
// Static siblings (team, flags, plans, queues) take routing precedence, so this
// dynamic segment only serves the general-settings sections; an unknown segment
// falls back to the first tab.
export default function GeneralSettingsSectionPage({ params }: { params: { section: string } }) {
  return <GeneralSettings activeTab={sectionToTab(params.section)} />;
}
