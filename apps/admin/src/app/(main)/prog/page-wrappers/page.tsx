import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Page Wrappers | Admin",
  description: "Manage page wrappers",
};

export default function PageWrappersPage() {
  return <ComingSoon title="Page Wrappers" description="Manage page wrappers" />;
}
