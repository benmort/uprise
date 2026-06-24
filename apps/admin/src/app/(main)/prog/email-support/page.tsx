import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Email Support | Admin",
  description: "Manage email support",
};

export default function EmailSupportPage() {
  return <ComingSoon title="Email Support" description="Manage email support" />;
}
