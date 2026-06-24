import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Release Notes | Admin",
  description: "View release notes",
};

export default function ReleaseNotesPage() {
  return <ComingSoon title="Release Notes" description="View release notes" />;
}
