// Data quality (QA) merged into the campaign Insights page — redirect to preserve old links.
import { redirect } from "next/navigation";

export default function QaRedirect({ params }: { params: { campaignId: string } }) {
  redirect(`/canvass/${params.campaignId}/insights`);
}
