import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Uploads | Admin",
  description: "Manage file uploads",
};

export default function UploadsPage() {
  return <ComingSoon title="Uploads" description="Manage file uploads" />;
}
