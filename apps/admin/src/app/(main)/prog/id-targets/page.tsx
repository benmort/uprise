import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "ID Targets | Admin",
  description: "Manage ID targets",
};

export default function IdTargetsPage() {
  return <ComingSoon title="ID Targets" description="Manage ID targets" />;
}
