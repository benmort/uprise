import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Grant Forms | Admin",
  description: "Manage grant forms",
};

export default function GrantManagementFormsPage() {
  return <ComingSoon title="Grant Forms" description="Manage grant forms" />;
}
