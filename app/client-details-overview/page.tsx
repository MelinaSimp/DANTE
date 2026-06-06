// Legacy route — canonical contacts page is now /contacts.
// Preserves bookmarks and deep links by forwarding the query string.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientDetailsOverviewRedirect({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const params = await searchParams;
  const qs = params.contactId ? `?contactId=${params.contactId}` : "";
  redirect(`/contacts${qs}`);
}
