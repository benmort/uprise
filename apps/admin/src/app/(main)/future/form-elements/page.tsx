import { redirect } from "next/navigation";

// The form-elements demo moved into the design-system Kitchen Sink (Super Admin → Kitchen Sink →
// Forms), where it renders the shared @uprise/ui form primitives instead of the prog sandbox kit.
// Kept as a redirect so any bookmarked link still lands somewhere sensible.
export default function FormElementsRedirect() {
  redirect("/super/kitchen-sink");
}
