import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Reviewing – Manage | Admin",
  description: "Manage grant reviewing",
};

export default function GrantManagementReviewingManagePage() {
  return <ComingSoon title="Reviewing – Manage" description="Manage grant reviewing" />;
}
