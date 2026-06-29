"use client";

import { List, Map as MapIcon } from "lucide-react";
import { Button } from "@uprise/ui";

export type WalkMode = "list" | "map";

/** List ⇄ map switch. List is the low-power default; the parent persists the
 *  choice (e.g. via useLocalStorage). */
export function WalkModeToggle({
  value,
  onChange,
}: {
  value: WalkMode;
  onChange: (mode: WalkMode) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-border p-0.5">
      <Button
        size="sm"
        variant={value === "list" ? "default" : "ghost"}
        className="rounded-full"
        onClick={() => onChange("list")}
      >
        <List className="mr-1 h-4 w-4" /> List
      </Button>
      <Button
        size="sm"
        variant={value === "map" ? "default" : "ghost"}
        className="rounded-full"
        onClick={() => onChange("map")}
      >
        <MapIcon className="mr-1 h-4 w-4" /> Map
      </Button>
    </div>
  );
}
