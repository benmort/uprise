import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Email Wrappers | Admin",
  description: "Manage email wrappers",
};

export default function EmailWrappersPage() {
  return <ComingSoon title="Email Wrappers" description="Manage email wrappers" />;
}
