"use client";

import { PersonStanding } from "lucide-react";
import { FieldAppFrame } from "@/components/app-embed/field-app-frame";

/** Yarns Canvass — the volunteer door-knocking app, embedded live (super-admin only). */
export default function YarnsCanvassPage() {
  return (
    <FieldAppFrame
      title="Yarns Canvass"
      icon={PersonStanding}
      description="The volunteer canvassing app, live — exactly what a canvasser sees, same session."
      path="/"
    />
  );
}
