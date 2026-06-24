import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Reports | Admin",
  description: "Generate and view reports",
};

export default function ReportsPage() {
  return <ComingSoon title="Reports" description="Generate and view reports" />;
}
