import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Segments | Admin",
  description: "Build and manage audience segments",
};

export default function AudienceSegmentsPage() {
  return <ComingSoon title="Segments" description="Build and manage audience segments" />;
}
