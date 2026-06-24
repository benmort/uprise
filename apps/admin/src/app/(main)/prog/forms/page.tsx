import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Forms | Admin",
  description: "Build and manage forms",
};

export default function FormsPage() {
  return <ComingSoon title="Forms" description="Build and manage forms" />;
}
