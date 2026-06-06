// components/contacts/ContactsLive.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Props = { workspaceId?: string | null };

export default function ContactsLive({ workspaceId }: Props) {
  const router = useRouter();

  useEffect(() => {
    const channel = supabase
      .channel("contacts-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
          ...(workspaceId ? { filter: `workspace_id=eq.${workspaceId}` } : {}),
        },
        (event) => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, workspaceId]);

  return null;
}
