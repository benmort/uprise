import { redirect } from "next/navigation";

/**
 * The public event RSVP experience is now the branded page in the action app. This legacy
 * `/e/[eventId]` route (kept working because links to it exist in the wild) redirects there.
 */
export default function PublicEventRedirect({ params }: { params: { eventId: string } }) {
  const base = process.env.NEXT_PUBLIC_ACTION_APP_URL || "http://localhost:3004";
  redirect(`${base}/events/${encodeURIComponent(params.eventId)}`);
}
