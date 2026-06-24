import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Reviewing – Progress | Admin",
  description: "Review progress",
};

export default function GrantManagementReviewingProgressPage() {
  return <ComingSoon title="Reviewing – Progress" description="Review progress" />;
}
