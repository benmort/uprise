import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Snippets | Admin",
  description: "Manage reusable snippets",
};

export default function SnippetsPage() {
  return <ComingSoon title="Snippets" description="Manage reusable snippets" />;
}
