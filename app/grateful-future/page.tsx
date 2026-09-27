import { redirect } from "next/navigation";

/** /grateful-future → the onboarding flow (landing page comes later). */
export default function GratefulFutureIndex() {
  redirect("/grateful-future/start");
}
