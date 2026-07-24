// Pure section registry for the AI settings hub. NON-client module (no "use client")
// so the server component [section]/page.tsx can import and call sectionFromSegment —
// same trap as future/tenant-settings/sections.ts.

export type AiSection =
  | "general"
  | "billing"
  | "personalization"
  | "memory"
  | "files"
  | "model"
  | "connectors"
  | "data-controls";

export const AI_SECTION_LABELS: Record<AiSection, string> = {
  general: "General",
  billing: "Credit and Billing",
  personalization: "Personalization",
  memory: "Memory",
  files: "File & Media",
  model: "Model",
  connectors: "Connector",
  "data-controls": "Data Control",
};

/** TailAdmin ai-settings grouping: the left rail renders these three headed groups. */
export const AI_SECTION_GROUPS: Array<{ label: string; sections: AiSection[] }> = [
  { label: "Account", sections: ["general", "billing", "personalization"] },
  { label: "Features", sections: ["memory", "files", "model"] },
  { label: "System", sections: ["connectors", "data-controls"] },
];

const ALL_SECTIONS = new Set<string>(AI_SECTION_GROUPS.flatMap((g) => g.sections));

export function sectionFromSegment(segment: string): AiSection {
  return ALL_SECTIONS.has(segment) ? (segment as AiSection) : "general";
}
