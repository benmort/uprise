import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Persons | Admin",
  description: "Look up and manage individual people",
};

export default function AudiencePersonsPage() {
  return <ComingSoon title="Persons" description="Look up and manage individual people" />;
}
