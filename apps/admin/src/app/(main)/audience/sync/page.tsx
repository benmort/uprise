import { AudienceHeader } from "@/components/audience/audience-header";
import { AudienceTabs } from "@/components/audience/audience-tabs";
import { DataSyncView } from "@/components/audience/data-sync-view";

/**
 * Data sync — a real route rather than a `?tab=` state of `/audience`, because it carries
 * its own data (connections, pull jobs and, as the write-back ships, push deliveries and
 * sync settings) that the other Audience tabs never touch. The tab bar renders here with
 * `sync` active so the split is invisible to the organiser.
 */
export default function DataSyncPage() {
  return (
    <div className="page-stack">
      <AudienceHeader />
      <AudienceTabs active="sync" />
      <DataSyncView />
    </div>
  );
}
