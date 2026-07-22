import { redirect } from "next/navigation";

/** Signups moved onto the Tenants list as a tab. Redirect the old route so existing links land there. */
export default function SuperSignupsRedirect() {
  redirect("/super/tenants?tab=signups");
}
