import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Questions & Custom Fields | Admin",
  description: "Manage questions and custom fields",
};

export default function QuestionsCustomFieldsPage() {
  return <ComingSoon title="Questions & Custom Fields" description="Manage questions and custom fields" />;
}
