import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Ladders | Admin",
  description: "Manage engagement ladders",
};

export default function LaddersPage() {
  return <ComingSoon title="Ladders" description="Manage engagement ladders" />;
}
