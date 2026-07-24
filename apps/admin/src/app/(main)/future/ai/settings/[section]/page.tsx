import { AiSettingsShell } from "../ai-settings-shell";
import { sectionFromSegment } from "../sections";

// Real per-section URLs for the AI settings hub: /future/ai/settings/general,
// …/billing, …/personalization, …/memory, …/files, …/model, …/connectors,
// …/data-controls. Unknown segments fall back to General.
export default function AiSettingsSectionPage({ params }: { params: { section: string } }) {
  return <AiSettingsShell active={sectionFromSegment(params.section)} />;
}
