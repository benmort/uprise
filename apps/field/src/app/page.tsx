import { redirect } from "next/navigation";

/** The field app has one home: the canvasser's assignments. */
export default function HomePage() {
  redirect("/field");
}
