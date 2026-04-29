// app/contacts/page.tsx
//
// Permanent redirect to the modern client overview. /contacts shipped
// in an earlier era of the app with a different design system; the
// canonical path is now /client-details-overview. Anyone who bookmarks
// /contacts or follows an old link lands cleanly on the modern page.
//
// The old ContactsClient component is left in components/contacts/ as
// dead code for now — the redirect makes it unreachable, but trimming
// it can land in a follow-up cleanup.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ContactsPage() {
  redirect("/client-details-overview");
}
