import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Keywords | Admin",
  description: "Manage keywords",
};

export default function KeywordsPage() {
  return <ComingSoon title="Keywords" description="Manage keywords" />;
}
