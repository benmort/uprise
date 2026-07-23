"use client";

import { MessagesSquare } from "lucide-react";
import { FieldAppFrame } from "@/components/app-embed/field-app-frame";

/** Yarns Texting — the volunteer P2P texting app, embedded live (super-admin only). */
export default function YarnsTextingPage() {
  return (
    <FieldAppFrame
      title="Yarns Texting"
      icon={MessagesSquare}
      description="The volunteer P2P texting app, live — text banks, sessions and the reply inbox."
      path="/texts"
    />
  );
}
