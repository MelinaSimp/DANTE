// app/frontend/agent/[agentId]/inbox/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Inbox, Search, MessageSquare, Phone, CheckCircle, XCircle,
  AlertCircle, HelpCircle, Trash2, ArrowLeft,
} from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-dialog";

interface Conversation {
  id: string;
  agent_id: string;
  from_number?: string;
  to_number?: string;
  status: "active" | "completed" | "failed" | "transferred";
  modality: "chat" | "voice" | "multi-modal";
  transcript?: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>;
  gathered_data?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export default function InboxPage() {
  const params = useParams();
  const agentId = (params?.agentId ?? "") as string;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"todo" | "follow-up" | "done">("todo");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadConversations() {
      if (!agentId) { setLoading(false); return; }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/conversations?agentId=${agentId}`);
        if (response.ok) {
          setConversations(await response.json() || []);
        } else {
          setError("Failed to load conversations");
        }
      } catch {
        setError("Failed to load conversations");
      } finally {
        setLoading(false);
      }
    }
    loadConversations();

    const channel = supabase
      .channel(`conversations-${agentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `agent_id=eq.${agentId}` }, () => loadConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agentId]);

  const getContactName = (c: Conversation): string => {
    const name = c.gathered_data?.customer_name || c.gathered_data?.name || c.gathered_data?.contact_name;
    if (name) return String(name);
    const cleaned = (c.from_number || "").replace(/^\+1/, "").replace(/\D/g, "");
    return cleaned.length >= 4 ? `User ${cleaned.slice(-4)}` : "Unknown User";
  };

  const getInitials = (name: string): string => {
    const parts = name.split(" ");
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  };

  const getLastMessage = (c: Conversation): string => {
    if (!c.transcript?.length) return "No messages yet";
    const msg = c.transcript[c.transcript.length - 1].content;
    return msg.length > 60 ? msg.substring(0, 60) + "..." : msg;
  };

  const getStatusBadge = (c: Conversation) => {
    if (c.status === "failed") return { label: "Failed", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle };
    if (c.status === "transferred") return { label: "Transferred", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertCircle };
    if (c.status === "completed") return { label: "Completed", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle };
    if (c.metadata?.needsHelp) return { label: "AI needs your help", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertCircle };
    if (c.metadata?.missingInfo) return { label: "AI missing info", color: "bg-gray-100 text-gray-700 border-gray-200", icon: HelpCircle };
    return { label: "Active", color: "bg-blue-100 text-blue-700 border-blue-200", icon: MessageSquare };
  };

  const formatTimeAgo = (dateString: string): string => {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getFilteredConversations = (): Conversation[] => {
    let filtered = conversations;
    if (activeTab === "todo") filtered = filtered.filter(c => c.status === "active");
    else if (activeTab === "follow-up") filtered = filtered.filter(c => c.status === "active" && c.metadata?.needsFollowUp);
    else if (activeTab === "done") filtered = filtered.filter(c => c.status === "completed" || c.status === "failed");

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => getContactName(c).toLowerCase().includes(q) || (c.from_number || "").includes(q) || getLastMessage(c).toLowerCase().includes(q));
    }
    return filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: "Delete conversation?", message: "This will permanently remove the conversation.", confirmText: "Delete", variant: "danger" });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (res.ok) setConversations(prev => prev.filter(c => c.id !== id));
    } catch { /* swallow */ } finally {
      setDeletingId(null);
    }
  };

  const filteredConversations = getFilteredConversations();

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Harvey top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-4 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
          <span className="text-[var(--ink-subtle)]">·</span>
          <span className="label-section">Workspace</span>
          <span className="text-[var(--ink-subtle)]">·</span>
          <span className="text-sm text-[var(--ink)]">Inbox</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 bg-white">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-semibold text-gray-900 mb-4">Conversations</h1>

            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-gray-200 mb-4">
              {(["todo", "follow-up", "done"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-3 px-1 text-sm font-medium transition-colors capitalize ${
                    activeTab === tab ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {tab === "follow-up" ? "Follow up" : tab}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
              />
            </div>

            {/* Content */}
            {loading ? (
              <div className="text-center py-16 text-gray-400 text-sm">Loading conversations...</div>
            ) : error ? (
              <div className="text-center py-16">
                <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
                <p className="text-gray-600 text-sm">{error}</p>
                <button onClick={() => window.location.reload()} className="mt-3 text-sm text-blue-600 hover:underline">Retry</button>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-16">
                <Inbox className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No conversations found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConversations.map((conversation) => {
                  const contactName = getContactName(conversation);
                  const initials = getInitials(contactName);
                  const lastMessage = getLastMessage(conversation);
                  const statusBadge = getStatusBadge(conversation);
                  const StatusIcon = statusBadge.icon;

                  return (
                    <div key={conversation.id} className="group bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-xs">
                            {initials}
                          </div>
                          {conversation.status === "active" && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{contactName}</span>
                              {conversation.modality === "voice" && <Phone className="h-3 w-3 text-gray-400" />}
                            </div>
                            <span className="text-xs text-gray-400">{formatTimeAgo(conversation.updated_at)}</span>
                          </div>
                          <p className="text-sm text-gray-500 truncate mb-1.5">{lastMessage}</p>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadge.color}`}>
                              <StatusIcon className="h-3 w-3" />
                              {statusBadge.label}
                            </span>
                            {conversation.from_number && (
                              <span className="text-[11px] text-gray-400">{conversation.from_number.replace(/^\+1/, "")}</span>
                            )}
                            <button
                              onClick={(e) => deleteConversation(conversation.id, e)}
                              disabled={deletingId === conversation.id}
                              className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-red-500 transition disabled:opacity-50"
                              aria-label="Delete conversation"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
