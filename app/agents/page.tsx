// Legacy route — redirects to /agent where agent management now lives.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AgentsRedirect() {
  redirect("/agent");
}
