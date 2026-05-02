// /settings/sms — connect your phone, set briefing + quiet-hours preferences.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import SmsSettingsClient from "./SmsSettingsClient";

export const dynamic = "force-dynamic";

export default async function SmsSettingsPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  return (
    <AppShell {...ctx}>
      <SmsSettingsClient />
    </AppShell>
  );
}
