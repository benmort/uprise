import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Sync | Admin",
  description: "Manage data syncs",
};

export default function SyncsPage() {
  return <ComingSoon title="Sync" description="Manage data syncs" />;
}
