import { DoorEntry } from "@uprise/field";

export default function DoorEntryPage({
  params,
}: {
  params: { turfId: string; stopId: string };
}) {
  return <DoorEntry turfId={params.turfId} stopId={params.stopId} />;
}
