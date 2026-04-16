"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ClientDetailsOverviewClient = dynamic(
  () => import("@/app/client-details-overview/ClientDetailsOverviewClient"),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div> }
);

type Contact = { id: string; name: string; phone?: string; email?: string };

interface ClientDetailsPanelProps {
  agentId: string;
  initialContactId?: string | null;
  onClose?: () => void;
}

export default function ClientDetailsPanel({ agentId, initialContactId = null, onClose }: ClientDetailsPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setContacts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <ClientDetailsOverviewClient
      initialContacts={contacts}
      initialContactId={initialContactId}
      panelMode
      onClose={onClose}
    />
  );
}
