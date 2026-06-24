import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Applications | Admin",
  description: "Manage grant applications",
};

export default function GrantManagementApplicationsPage() {
  return <ComingSoon title="Applications" description="Manage grant applications" />;
}
