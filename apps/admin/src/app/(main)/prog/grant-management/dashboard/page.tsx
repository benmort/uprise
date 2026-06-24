import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Grant Management | Admin",
  description: "Grant management dashboard",
};

export default function GrantManagementDashboardPage() {
  return <ComingSoon title="Grant Management" description="Grant management dashboard" />;
}
