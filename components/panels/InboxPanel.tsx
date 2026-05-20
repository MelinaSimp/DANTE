"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Inbox, Search, MessageSquare, Phone, CheckCircle, XCircle, AlertCircle, HelpCircle, Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface Conversation {
  id: string;
  agent_id: string;
  from_number?: string;
  status: "active" | "completed" | "failed" | "transferred";
  modality: "chat" | "voice" | "multi-modal";
  transcript?: Array<{ role: string; content: string }>;
  gathered_data?: Record<string, any>;
  metadata?: Record<string, any>;
  updated_at: string;
}

export default function InboxPanel({ agentId }: { agentId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"todo" | "follow-up" | "done">("todo");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/conversations?agentId=${agentId}`);
        if (res.ok) setConversations(await res.json() || []);
      } catch {} finally { setLoading(false); }
    }
    load();
    const channel = supabase
      .channel(`panel-conversations-${agentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `agent_id=eq.${agentId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agentId]);

  const getName = (c: Conversation) => {
    const n = c.gathered_data?.customer_name || c.gathered_data?.name || c.gathered_data?.contact_name;
    if (n) return String(n);
    const cleaned = (c.from_number || "").replace(/^\+1/, "").replace(/\D/g, "");
    return cleaned.length >= 4 ? `User ${cleaned.slice(-4)}` : "Unknown";
  };

  const getLastMsg = (c: Conversation) => {
    if (!c.transcript?.length) return "No messages";
    const msg = c.transcript[c.transcript.length - 1].content;
    return msg.length > 80 ? msg.substring(0, 80) + "..." : msg;
  };

  const getBadge = (c: Conversation) => {
    if (c.status === "failed") return { label: "Failed", cls: "bg-red-100 text-red-700", icon: XCircle };
    if (c.status === "transferred") return { label: "Transferred", cls: "bg-orange-100 text-orange-700", icon: AlertCircle };
    if (c.status === "completed") return { label: "Completed", cls: "bg-green-100 text-green-700", icon: CheckCircle };
    if (c.metadata?.needsHelp) return { label: "Needs help", cls: "bg-orange-100 text-orange-700", icon: AlertCircle };
    return { label: "Active", cls: "bg-cyan-100 text-cyan-700", icon: MessageSquare };
  };

  const timeAgo = (d: string) => {
    const ms = Date.now() - new Date(d).getTime();
    const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), dy = Math.floor(ms / 86400000);
    if (m < 1) return "Now"; if (m < 60) return `${m}m`; if (h < 24) return `${h}h`; if (dy < 7) return `${dy}d`;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const deleteConv = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: "Delete conversation?", message: "This will permanently remove the conversation.", confirmText: "Delete", variant: "danger" });
    if (!ok) return;
    setDeletingId(id);
    try { const r = await fetch(`/api/conversations/${id}`, { method: "DELETE" }); if (r.ok) setConversations(p => p.filter(c => c.id !== id)); }
    catch {} finally { setDeletingId(null); }
  };

  let filtered = conversations;
  if (activeTab === "todo") filtered = filtered.filter(c => c.status === "active");
  else if (activeTab === "follow-up") filtered = filtered.filter(c => c.status === "active" && c.metadata?.needsFollowUp);
  else filtered = filtered.filter(c => c.status === "completed" || c.status === "failed");
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(c => getName(c).toLowerCase().includes(q) || (c.from_number || "").includes(q));
  }
  filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-6 border-b border-[var(--glass-border)] mb-4">
        {(["todo", "follow-up", "done"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-sm font-medium capitalize transition ${activeTab === tab ? "text-cyan-600 border-b-2 border-cyan-600" : "text-[var(--ink-subtle)] hover:text-[var(--ink)]"}`}>
            {tab === "follow-up" ? "Follow up" : tab}
          </button>
        ))}
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-subtle)]" />
        <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--canvas-subtle)] text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20" />
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 bg-[var(--canvas)] rounded-xl border border-[var(--glass-border)] p-4">
              <Skeleton variant="circular" width={40} height={40} className="!bg-[var(--glass-hover)]" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton variant="text" width="40%" height={14} className="!bg-[var(--glass-hover)]" />
                <Skeleton variant="text" width="80%" height={12} className="!bg-[var(--glass-hover)]" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          theme="light"
          title={
            activeTab === "todo"
              ? "No active conversations"
              : activeTab === "follow-up"
              ? "Nothing to follow up on"
              : "No completed conversations"
          }
          description={
            activeTab === "todo"
              ? "Conversations will appear here as soon as your agent starts handling chats or calls."
              : activeTab === "follow-up"
              ? "Conversations flagged for follow-up will show up here."
              : "Once your agent finishes a conversation, the history will live here."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const badge = getBadge(c);
            const Icon = badge.icon;
            return (
              <div key={c.id} className="group flex items-start gap-3 bg-[var(--canvas)] rounded-xl border border-[var(--glass-border)] p-4 hover:shadow-sm transition">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center text-white text-xs font-bold">
                    {getName(c).substring(0, 2).toUpperCase()}
                  </div>
                  {c.status === "active" && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-semibold text-[var(--ink)] flex items-center gap-1.5">
                      {getName(c)} {c.modality === "voice" && <Phone className="h-3 w-3 text-[var(--ink-subtle)]" />}
                    </span>
                    <span className="text-[11px] text-[var(--ink-subtle)]">{timeAgo(c.updated_at)}</span>
                  </div>
                  <p className="text-sm text-[var(--ink-subtle)] truncate mb-1">{getLastMsg(c)}</p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}><Icon className="h-3 w-3" />{badge.label}</span>
                    <button onClick={e => deleteConv(c.id, e)} disabled={deletingId === c.id}
                      className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-red-500 transition" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
