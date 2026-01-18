"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { MessageSquare, Search, Send, Phone, User, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useTheme } from "./ThemeProvider";
// Using native Date methods instead of date-fns

interface Conversation {
  id: string;
  from_number: string;
  to_number: string;
  status: "active" | "completed";
  transcript: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>;
  gathered_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface InboxPageProps {
  agentId: string;
}

export default function InboxPage({ agentId }: InboxPageProps) {
  const { colors } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "all">("active");
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLDivElement>(null);

  // Load conversations
  useEffect(() => {
    if (!agentId) return;

    async function loadConversations() {
      try {
        let query = supabase
          .from("conversations")
          .select("*")
          .eq("agent_id", agentId)
          .eq("modality", "chat") // Only SMS conversations
          .order("updated_at", { ascending: false });

        // Apply status filter
        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error loading conversations:", error);
          return;
        }

        if (data) {
          setConversations(data as Conversation[]);
          // Auto-select first conversation if none selected
          if (!selectedConversation && data.length > 0) {
            setSelectedConversation(data[0] as Conversation);
          }
        }
      } catch (error) {
        console.error("Failed to load conversations:", error);
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
        (payload) => {
          console.log("Conversation update:", payload);
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId, statusFilter]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.transcript]);

  // Filter conversations by search query
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      conv.from_number.toLowerCase().includes(query) ||
      conv.to_number.toLowerCase().includes(query) ||
      (conv.gathered_data?.customer_name &&
        String(conv.gathered_data.customer_name).toLowerCase().includes(query)) ||
      conv.transcript.some((msg) => msg.content.toLowerCase().includes(query))
    );
  });

  // Get contact name from gathered data
  const getContactName = (conversation: Conversation): string | null => {
    return (
      conversation.gathered_data?.customer_name ||
      conversation.gathered_data?.name ||
      conversation.gathered_data?.contact_name ||
      null
    );
  };

  // Format phone number for display
  const formatPhoneNumber = (phone: string): string => {
    // Remove +1 prefix if present
    const cleaned = phone.replace(/^\+1/, "");
    // Format as (XXX) XXX-XXXX
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  // Get last message preview
  const getLastMessage = (conversation: Conversation): string => {
    if (!conversation.transcript || conversation.transcript.length === 0) {
      return "No messages";
    }
    const lastMsg = conversation.transcript[conversation.transcript.length - 1];
    return lastMsg.content.length > 50
      ? lastMsg.content.substring(0, 50) + "..."
      : lastMsg.content;
  };

  // Get last message time
  const getLastMessageTime = (conversation: Conversation): string => {
    if (!conversation.updated_at) return "";
    try {
      const date = new Date(conversation.updated_at);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      // Format date using native Date methods
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  // Send reply
  const handleSendReply = async () => {
    if (!selectedConversation || !replyText.trim() || sendingReply) return;

    setSendingReply(true);

    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: replyText.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send reply");
      }

      // Add message to local transcript immediately for instant feedback
      const newMessage = {
        role: "assistant" as const,
        content: replyText.trim(),
        timestamp: new Date().toISOString(),
      };

      setSelectedConversation({
        ...selectedConversation,
        transcript: [...selectedConversation.transcript, newMessage],
        updated_at: new Date().toISOString(),
      });

      // Update conversations list
      setConversations(
        conversations.map((conv) =>
          conv.id === selectedConversation.id
            ? {
                ...conv,
                transcript: [...conv.transcript, newMessage],
                updated_at: new Date().toISOString(),
              }
            : conv
        )
      );

      setReplyText("");
    } catch (error: any) {
      console.error("Error sending reply:", error);
      alert(error.message || "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`border-b ${colors.border} ${colors.bgSecondary} p-4`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-semibold ${colors.text}`}>Inbox</h2>
          <div className="flex items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "active" | "completed" | "all")}
              className={`px-3 py-1.5 rounded-2xl border ${colors.border} ${colors.inputBg} ${colors.text} text-sm focus:outline-none focus:border-[#f97316]`}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${colors.textTertiary}`} />
          <input
            type="text"
            placeholder="Search by phone number or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-2xl border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} text-sm focus:outline-none focus:border-[#f97316]`}
          />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <div
          ref={conversationListRef}
          className={`w-80 border-r ${colors.border} ${colors.bgSecondary} overflow-y-auto`}
        >
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className={`h-12 w-12 mx-auto mb-4 ${colors.textTertiary}`} />
              <p className={`text-sm ${colors.textSecondary}`}>
                {searchQuery ? "No conversations match your search" : "No conversations yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredConversations.map((conversation) => {
                const contactName = getContactName(conversation);
                const phoneNumber = formatPhoneNumber(conversation.from_number);
                const isSelected = selectedConversation?.id === conversation.id;

                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConversation(conversation)}
                    className={`w-full text-left p-4 hover:bg-gray-100 dark:hover:bg-gray-800 transition ${
                      isSelected
                        ? "bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Phone className="h-4 w-4 text-gray-500 flex-shrink-0" />
                          <p className={`text-sm font-medium ${colors.text} truncate`}>
                            {contactName || phoneNumber}
                          </p>
                        </div>
                        {contactName && (
                          <p className={`text-xs ${colors.textTertiary} truncate`}>{phoneNumber}</p>
                        )}
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          conversation.status === "active"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {conversation.status}
                      </span>
                    </div>
                    <p className={`text-xs ${colors.textSecondary} line-clamp-2 mb-1`}>
                      {getLastMessage(conversation)}
                    </p>
                    <p className={`text-xs ${colors.textTertiary}`}>{getLastMessageTime(conversation)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Message Thread */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className={`border-b ${colors.border} ${colors.bgSecondary} p-4`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${colors.bgTertiary}`}>
                    <User className={`h-5 w-5 ${colors.textSecondary}`} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${colors.text}`}>
                      {getContactName(selectedConversation) ||
                        formatPhoneNumber(selectedConversation.from_number)}
                    </p>
                    <p className={`text-sm ${colors.textTertiary}`}>
                      {formatPhoneNumber(selectedConversation.from_number)}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      selectedConversation.status === "active"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {selectedConversation.status}
                  </span>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedConversation.transcript && selectedConversation.transcript.length > 0 ? (
                  selectedConversation.transcript.map((message, index) => {
                    const isUser = message.role === "user";
                    const timestamp = message.timestamp
                      ? (() => {
                          try {
                            const date = new Date(message.timestamp);
                            return date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            });
                          } catch {
                            return "";
                          }
                        })()
                      : "";

                    return (
                      <div
                        key={index}
                        className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                            isUser
                              ? `${colors.bgSecondary} ${colors.text}`
                              : "bg-orange-500 text-white"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          {timestamp && (
                            <p
                              className={`text-xs mt-1 ${
                                isUser ? colors.textTertiary : "text-orange-100"
                              }`}
                            >
                              {timestamp}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8">
                    <MessageSquare className={`h-12 w-12 mx-auto mb-4 ${colors.textTertiary}`} />
                    <p className={`text-sm ${colors.textSecondary}`}>No messages yet</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input */}
              <div className={`border-t ${colors.border} ${colors.bgSecondary} p-4`}>
                <div className="flex items-end gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder="Type your reply..."
                    rows={3}
                    className={`flex-1 rounded-2xl border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} px-4 py-2 text-sm focus:outline-none focus:border-[#3351ff] resize-none`}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sendingReply}
                    className={`px-4 py-2 rounded-2xl bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2`}
                  >
                    {sendingReply ? (
                      <>
                        <Clock className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className={`h-16 w-16 mx-auto mb-4 ${colors.textTertiary}`} />
                <p className={`text-lg font-medium ${colors.text} mb-2`}>Select a conversation</p>
                <p className={`text-sm ${colors.textSecondary}`}>
                  Choose a conversation from the list to view messages
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

