import React from "react";
import FeatureRows from "@/components/marketing/sections/FeatureRows";

/**
 * The alternating "everything your campaign runs on" rows.
 *
 * Now a thin alias: the rows themselves live in components/marketing/sections/FeatureRows.tsx so
 * /campaigners can render the same five systems without a second copy. This export stays because
 * /homepage4 (the previous homepage, kept for comparison) imports it by this name.
 */
export default function NotableFeatures() {
  return <FeatureRows />;
}
