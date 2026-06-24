import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Custom Targets | Admin",
  description: "Manage custom targets",
};

export default function CustomTargetsPage() {
  return <ComingSoon title="Custom Targets" description="Manage custom targets" />;
}
