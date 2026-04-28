// app/inbox/page.tsx — auth gate; data fetched client-side.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <InboxClient />
    </AppShell>
  );
}
