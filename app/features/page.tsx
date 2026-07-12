import { redirect } from "next/navigation";

// Legacy /features marketing page — the NEW-DRIFT-WEBSITE copy now lives at "/".
export default function FeaturesRedirect() {
  redirect("/");
}
