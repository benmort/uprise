import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Fundraisers | Admin",
  description: "Create and manage fundraisers",
};

export default function FundraisersPage() {
  return <ComingSoon title="Fundraisers" description="Create and manage fundraisers" />;
}
