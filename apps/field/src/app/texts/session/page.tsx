import { Suspense } from "react";
import { TextSession } from "@uprise/field";

export default function TextsSessionPage() {
  return (
    <Suspense fallback={null}>
      <TextSession />
    </Suspense>
  );
}
