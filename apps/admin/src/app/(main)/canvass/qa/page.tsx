// All-campaigns QA merged into the aggregate Insights page — redirect to preserve old links.
import { redirect } from "next/navigation";

export default function QaAggregateRedirect() {
  redirect("/canvass/insights");
}
