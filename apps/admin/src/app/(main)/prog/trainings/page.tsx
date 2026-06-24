import type { Metadata } from "next";
import { ComingSoon } from "@/components/prog/shared/coming-soon";

export const metadata: Metadata = {
  title: "Trainings | Admin",
  description: "Manage trainings",
};

export default function TrainingsPage() {
  return <ComingSoon title="Trainings" description="Manage trainings" />;
}
