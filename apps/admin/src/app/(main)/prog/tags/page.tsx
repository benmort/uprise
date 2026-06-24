import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Tags | Admin",
  description: "Organise records with tags",
};

export default function TagsPage() {
  return <ComingSoon title="Tags" description="Organise records with tags" />;
}
