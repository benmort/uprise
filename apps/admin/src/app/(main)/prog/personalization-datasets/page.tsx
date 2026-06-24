import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Personalization Datasets | Admin",
  description: "Manage personalization datasets",
};

export default function PersonalizationDatasetsPage() {
  return <ComingSoon title="Personalization Datasets" description="Manage personalization datasets" />;
}
