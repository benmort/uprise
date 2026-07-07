import { ComplianceSettings } from "@/components/settings/compliance";
import { PageHeader } from "@/components/ui/page-header";

// Compliance also lives as a tab on the General settings page; this standalone route
// renders the same component so any direct links keep working.
export default function CompliancePage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Compliance"
        description="The opt-out ledger. Opted-out contacts are automatically excluded from every send."
      />
      <ComplianceSettings />
    </div>
  );
}
