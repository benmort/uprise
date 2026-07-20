import { FieldInstallNotice, WalkView } from "@uprise/field";

export default function WalkViewPage({ params }: { params: { turfId: string } }) {
  return (
    <>
      {/* On-load nudge: desktop → open on your phone (scan QR); phone/tablet browser →
          install to home screen. Super-admins + the installed app see nothing. */}
      <FieldInstallNotice />
      <WalkView turfId={params.turfId} />
    </>
  );
}
