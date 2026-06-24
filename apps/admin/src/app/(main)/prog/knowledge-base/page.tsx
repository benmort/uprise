import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Knowledge Base | Admin",
  description: "Browse the knowledge base",
};

export default function KnowledgeBasePage() {
  return <ComingSoon title="Knowledge Base" description="Browse the knowledge base" />;
}
