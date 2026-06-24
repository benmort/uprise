import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Queries | Admin",
  description: "Build and run audience queries",
};

export default function QueriesPage() {
  return <ComingSoon title="Queries" description="Build and run audience queries" />;
}
