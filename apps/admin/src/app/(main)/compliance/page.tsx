import { ComplianceSettings } from "@/components/settings/compliance";

// Compliance also lives as a tab on the General settings page; this standalone route
// renders the same component so any direct links keep working.
export default function CompliancePage() {
  return (
    <div className="page-stack">
      <div>
        <h1 className="text-2xl font-extrabold">Compliance</h1>
        <p className="text-sm text-muted-foreground">
          The opt-out ledger. Opted-out contacts are automatically excluded from every send.
        </p>
      </div>
      <ComplianceSettings />
    </div>
  );
}
