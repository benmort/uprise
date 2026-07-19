import { WalkView } from "@uprise/field";

export default function WalkViewPage({ params }: { params: { turfId: string } }) {
  return <WalkView turfId={params.turfId} />;
}
