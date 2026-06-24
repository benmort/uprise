import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Direct Mail | Admin",
  description: "Send and track direct mail campaigns",
};

export default function DirectMailPage() {
  return <ComingSoon title="Direct Mail" description="Send and track direct mail campaigns" />;
}
