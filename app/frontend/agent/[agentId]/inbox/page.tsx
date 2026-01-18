// app/frontend/agent/[agentId]/inbox/page.tsx - Inbox Page with Apple-style Light Theme
"use client";

import { useState, useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { Bot, Calendar as CalIcon, Database as DbIcon, Shield, Sparkles, BarChart3, Inbox, Search, Filter, MessageSquare, Phone, CheckCircle, XCircle, AlertCircle, HelpCircle, Trash2 } from "lucide-react";

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
  const pathname = usePathname();
  const agentId = params.agentId as string;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"todo" | "follow-up" | "done">("todo");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    // Override global dark theme styles for Apple-style light theme
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector('main');
    
    const originalHtmlBg = html.style.background;
    const originalBodyBg = body.style.background;
    const originalBodyColor = body.style.color;
    const originalMainBg = main ? (main as HTMLElement).style.background : null;
    
    html.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('color', '#111827', 'important');
    if (main) {
      (main as HTMLElement).style.setProperty('background', '#f5f5f7', 'important');
    }

    return () => {
      html.style.setProperty('background', originalHtmlBg, 'important');
      body.style.setProperty('background', originalBodyBg, 'important');
      body.style.setProperty('color', originalBodyColor, 'important');
      if (main && originalMainBg !== null) {
        (main as HTMLElement).style.setProperty('background', originalMainBg, 'important');
      }
    };
  }, []);

  useEffect(() => {
    async function loadConversations() {
      if (!agentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/conversations?agentId=${agentId}`);
        if (response.ok) {
          const data = await response.json();
          setConversations(data || []);
        }
      } catch (error) {
        console.error("Failed to load conversations:", error);
      } finally {
        setLoading(false);
      }
    }
    loadConversations();

    // Set up real-time subscription
    const channel = supabase
      .channel(`conversations-${agentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `agent_id=eq.${agentId}`,
        },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId]);

  // Get contact name from gathered data
  const getContactName = (conversation: Conversation): string => {
    const name = conversation.gathered_data?.customer_name || 
                 conversation.gathered_data?.name || 
                 conversation.gathered_data?.contact_name;
    if (name) return String(name);
    
    // Fallback to phone number initials
    const phone = conversation.from_number || "";
    const cleaned = phone.replace(/^\+1/, "").replace(/\D/g, "");
    if (cleaned.length >= 4) {
      return `User ${cleaned.slice(-4)}`;
    }
    return "Unknown User";
  };

  // Get initials for avatar
  const getInitials = (name: string): string => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get last message preview
  const getLastMessage = (conversation: Conversation): string => {
    if (!conversation.transcript || conversation.transcript.length === 0) {
      return "No messages yet";
    }
    const lastMsg = conversation.transcript[conversation.transcript.length - 1];
    return lastMsg.content.length > 60 ? lastMsg.content.substring(0, 60) + "..." : lastMsg.content;
  };

  // Get status badge info
  const getStatusBadge = (conversation: Conversation): { label: string; color: string; icon: any } => {
    if (conversation.status === "failed") {
      return { label: "Failed", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle };
    }
    if (conversation.status === "transferred") {
      return { label: "Transferred", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertCircle };
    }
    if (conversation.status === "completed") {
      return { label: "Completed", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle };
    }
    
    // Active status - check for special cases
    const metadata = conversation.metadata || {};
    if (metadata.needsHelp) {
      return { label: "AI needs your help", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertCircle };
    }
    if (metadata.missingInfo) {
      return { label: "AI missing info", color: "bg-gray-100 text-gray-700 border-gray-200", icon: HelpCircle };
    }
    
    return { label: "Active", color: "bg-blue-100 text-blue-700 border-blue-200", icon: MessageSquare };
  };

  // Format timestamp
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Filter conversations by tab
  const getFilteredConversations = (): Conversation[] => {
    let filtered = conversations;

    // Filter by tab
    if (activeTab === "todo") {
      filtered = filtered.filter(c => c.status === "active");
    } else if (activeTab === "follow-up") {
      filtered = filtered.filter(c => c.status === "active" && (c.metadata?.needsFollowUp || false));
    } else if (activeTab === "done") {
      filtered = filtered.filter(c => c.status === "completed" || c.status === "failed");
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(conv => {
        const name = getContactName(conv).toLowerCase();
        const phone = (conv.from_number || "").toLowerCase();
        const lastMsg = getLastMessage(conv).toLowerCase();
        return name.includes(query) || phone.includes(query) || lastMsg.includes(query);
      });
    }

    return filtered.sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (!confirm("Are you sure you want to delete this conversation?")) {
      return;
    }

    setDeletingId(conversationId);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove from local state
        setConversations(prev => prev.filter(c => c.id !== conversationId));
      } else {
        const error = await response.json();
        alert(`Failed to delete conversation: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      alert("Failed to delete conversation. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // Sidebar navigation items
  const sidebarItems = [
    { 
      name: "Agents", 
      icon: Bot, 
      href: "/frontend",
      active: pathname === "/frontend" || pathname?.startsWith("/frontend/agent"),
      requiresAgent: false
    },
    { 
      name: "Calendar", 
      icon: CalIcon, 
      href: `/frontend/agent/${agentId}/schedule`,
      active: pathname?.includes("/schedule"),
      requiresAgent: true
    },
    { 
      name: "Inbox", 
      icon: Inbox, 
      href: `/frontend/agent/${agentId}/inbox`,
      active: pathname?.includes("/inbox"),
      requiresAgent: true
    },
    { 
      name: "LLM", 
      icon: Sparkles, 
      href: `/frontend/agent/${agentId}/llm`,
      active: pathname?.includes("/llm"),
      requiresAgent: true
    },
    { 
      name: "Insights", 
      icon: BarChart3, 
      href: `/frontend/agent/${agentId}/insights`,
      active: pathname?.includes("/insights"),
      requiresAgent: true
    },
  ];

  const filteredConversations = getFilteredConversations();

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex" style={{ background: '#f5f5f7' }}>
      {/* Left Sidebar - Apple Glass Style */}
      <div className="fixed left-0 top-0 h-full w-72 z-50">
        <div 
          className="h-full border-r border-gray-300/10 bg-gray-200/90 backdrop-blur-sm shadow-2xl"
        >
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-200/20">
            <Link href="/frontend" className="inline-flex items-center gap-2">
              <img 
                src="/brand/logo-circle.png" 
                alt="Drift Logo"
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="text-lg font-medium text-gray-900">Drift</span>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.active;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600/10 text-blue-600"
                      : "text-gray-700 hover:bg-white/30"
                  }`}
                >
                  {/* Icon with purplish gradient halo */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-full blur-sm opacity-50"></div>
                    <div className="relative bg-white rounded-full p-2">
                      <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : "text-gray-600"}`} />
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${isActive ? "text-blue-600" : "text-gray-700"}`}>
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 ml-72 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-6 bg-[#f5f5f7]">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-semibold text-gray-900 mb-4">Conversations</h1>
              
              {/* Tabs */}
              <div className="flex items-center gap-8 border-b border-gray-200">
                <button
                  onClick={() => setActiveTab("todo")}
                  className={`pb-3 px-1 text-sm font-medium transition-colors ${
                    activeTab === "todo"
                      ? "text-blue-600 border-b-2 border-blue-600"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Todo
                </button>
                <button
                  onClick={() => setActiveTab("follow-up")}
                  className={`pb-3 px-1 text-sm font-medium transition-colors ${
                    activeTab === "follow-up"
                      ? "text-blue-600 border-b-2 border-blue-600"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Follow up
                </button>
                <button
                  onClick={() => setActiveTab("done")}
                  className={`pb-3 px-1 text-sm font-medium transition-colors ${
                    activeTab === "done"
                      ? "text-blue-600 border-b-2 border-blue-600"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Done
                </button>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="mb-4 flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition flex items-center gap-2 text-sm font-medium">
                <Filter className="h-4 w-4" />
                Filter
              </button>
            </div>

            {/* Conversation List */}
            {loading ? (
              <div className="text-center py-12 text-gray-500">Loading conversations...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-12">
                <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No conversations found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConversations.map((conversation) => {
                  const contactName = getContactName(conversation);
                  const initials = getInitials(contactName);
                  const lastMessage = getLastMessage(conversation);
                  const statusBadge = getStatusBadge(conversation);
                  const StatusIcon = statusBadge.icon;
                  const timeAgo = formatTimeAgo(conversation.updated_at);

                  return (
                    <div
                      key={conversation.id}
                      className="group bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                            {initials}
                          </div>
                          {conversation.status === "active" && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-gray-900">{contactName}</h3>
                              {conversation.modality === "voice" && (
                                <Phone className="h-3 w-3 text-gray-400" />
                              )}
                            </div>
                            <span className="text-xs text-gray-500">{timeAgo}</span>
                          </div>

                          <p className="text-sm text-gray-600 mb-2 line-clamp-1">{lastMessage}</p>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusBadge.color}`}>
                              <StatusIcon className="h-3 w-3" />
                              {statusBadge.label}
                            </span>
                            {conversation.from_number && (
                              <span className="text-xs text-gray-500">
                                {conversation.from_number.replace(/^\+1/, "")}
                              </span>
                            )}
                            <button
                              onClick={(e) => deleteConversation(conversation.id, e)}
                              disabled={deletingId === conversation.id}
                              className="ml-auto opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition disabled:opacity-50"
                              title="Delete conversation"
                            >
                              <Trash2 className="h-4 w-4" />
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
    </div>
  );
}
