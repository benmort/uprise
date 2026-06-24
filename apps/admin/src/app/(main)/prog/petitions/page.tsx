import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Petitions | Admin",
  description: "Create and manage petitions",
};

export default function PetitionsPage() {
  return <ComingSoon title="Petitions" description="Create and manage petitions" />;
}
