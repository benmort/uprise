import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Activists | Admin",
  description: "Manage activists",
};

export default function ActivistsPage() {
  return <ComingSoon title="Activists" description="Manage activists" />;
}
