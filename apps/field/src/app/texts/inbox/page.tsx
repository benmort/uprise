import { Suspense } from "react";
import { TextInbox } from "@uprise/field";

export default function TextsInboxPage() {
  return (
    <Suspense fallback={null}>
      <TextInbox />
    </Suspense>
  );
}
