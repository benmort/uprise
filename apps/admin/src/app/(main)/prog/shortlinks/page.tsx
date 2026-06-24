import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Shortlinks | Admin",
  description: "Create and manage shortlinks",
};

export default function ShortlinksPage() {
  return <ComingSoon title="Shortlinks" description="Create and manage shortlinks" />;
}
