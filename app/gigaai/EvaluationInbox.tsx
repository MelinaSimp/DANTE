// app/gigaai/EvaluationInbox.tsx
// Guests inbox component - displays customer conversations in inbox format

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter, MessageSquare, Phone } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { GuestConversation } from "@/app/api/evaluations/guests/route";
import { getInitials, formatRelativeTime, truncateText } from "@/lib/customers";

type FilterType = "all" | "yours" | "mentions";
type TabType = "todo" | "followup" | "done";

interface EvaluationInboxProps {
  onSelectCustomer: (customerId: string) => void;
}

export default function EvaluationInbox({ onSelectCustomer }: EvaluationInboxProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const [conversations, setConversations] = useState<GuestConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState<TabType>("todo");

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    try {
      setLoading(true);
      const response = await fetch("/api/evaluations/guests");
      if (!response.ok) throw new Error("Failed to load conversations");
      const data = await response.json();
      setConversations(data);
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "inquiry":
        return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
      case "current":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case "past":
        return "bg-gray-500/20 text-gray-300 border-gray-500/30";
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "inquiry":
        return "Inquiry";
      case "current":
        return "Current";
      case "past":
        return "Past";
      default:
        return status;
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = conv.customerName?.toLowerCase().includes(query);
      const matchesPhone = conv.customerPhone.toLowerCase().includes(query);
      const matchesPreview = conv.lastMessagePreview?.toLowerCase().includes(query);
      if (!matchesName && !matchesPhone && !matchesPreview) return false;
    }

    // Status filter (tabs)
    if (activeTab === "todo" && conv.status !== "inquiry") return false;
    if (activeTab === "followup" && conv.status !== "current") return false;
    if (activeTab === "done" && conv.status !== "past") return false;

    // Additional filters (simplified for now)
    if (filter === "yours") {
      // TODO: Filter by assigned agent
      return true;
    }
    if (filter === "mentions") {
      // TODO: Filter by mentions
      return true;
    }

    return true;
  });

  return (
    <div className={`h-full flex flex-col ${colors.bg}`}>
      {/* Header */}
      <div className={`border-b ${colors.border} px-6 py-4 bg-[#242423]/80`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-semibold ${colors.text}`}>Guests</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-2xl text-sm transition ${
                filter === "all"
                  ? `${colors.buttonPrimary} text-white`
                  : `${colors.bgTertiary} ${colors.textSecondary} hover:${colors.hover}`
              }`}
            >
              All conversations
            </button>
            <button
              onClick={() => setFilter("yours")}
              className={`px-3 py-1.5 rounded-2xl text-sm transition ${
                filter === "yours"
                  ? `${colors.buttonPrimary} text-white`
                  : `${colors.bgTertiary} ${colors.textSecondary} hover:${colors.hover}`
              }`}
            >
              Your conversations
            </button>
            <button
              onClick={() => setFilter("mentions")}
              className={`px-3 py-1.5 rounded-2xl text-sm transition ${
                filter === "mentions"
                  ? `${colors.buttonPrimary} text-white`
                  : `${colors.bgTertiary} ${colors.textSecondary} hover:${colors.hover}`
              }`}
            >
              Mentions
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${colors.iconSecondary}`} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-2xl ${colors.bgTertiary} ${colors.border} border ${colors.text} placeholder:${colors.textTertiary} focus:outline-none focus:ring-2 focus:ring-[#3351ff]/50`}
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-transparent">
          <button
            onClick={() => setActiveTab("todo")}
            className={`py-3 border-b-2 transition ${
              activeTab === "todo"
                ? `border-[#3351ff] ${colors.text} font-medium`
                : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
            }`}
          >
            Todo
          </button>
          <button
            onClick={() => setActiveTab("followup")}
            className={`py-3 border-b-2 transition ${
              activeTab === "followup"
                ? `border-[#3351ff] ${colors.text} font-medium`
                : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
            }`}
          >
            Follow up
          </button>
          <button
            onClick={() => setActiveTab("done")}
            className={`py-3 border-b-2 transition ${
              activeTab === "done"
                ? `border-[#3351ff] ${colors.text} font-medium`
                : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
            }`}
          >
            Done
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className={`text-center ${colors.textTertiary} text-sm py-8`}>
            Loading conversations...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className={`text-center ${colors.textTertiary} text-sm py-8`}>
            No conversations found
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredConversations.map((conv) => (
              <button
                key={conv.customerId}
                onClick={() => onSelectCustomer(conv.customerId)}
                className={`w-full text-left p-4 hover:bg-white/5 transition ${colors.bg}`}
              >
                <div className="flex items-start gap-3">
                  {/* Initials Avatar */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colors.bgTertiary} flex items-center justify-center ${colors.text} font-medium text-sm`}>
                    {getInitials(conv.customerName)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${colors.text} truncate`}>
                          {conv.customerName || conv.customerPhone}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs border ${getStatusColor(conv.status)}`}>
                          {getStatusLabel(conv.status)}
                        </span>
                      </div>
                      {conv.lastMessageAt && (
                        <span className={`text-xs ${colors.textTertiary} flex-shrink-0 ml-2`}>
                          {formatRelativeTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>

                    {/* Message Preview */}
                    {conv.lastMessagePreview && (
                      <p className={`text-sm ${colors.textSecondary} mb-1 truncate`}>
                        {truncateText(conv.lastMessagePreview, 80)}
                      </p>
                    )}

                    {/* Response Indicator */}
                    <div className="flex items-center gap-2">
                      {conv.responseBy && (
                        <span className={`text-xs ${colors.textTertiary}`}>
                          Replied by {conv.responseBy}
                        </span>
                      )}
                      <Phone className={`h-3 w-3 ${colors.iconSecondary}`} />
                      <span className={`text-xs ${colors.textTertiary}`}>
                        {conv.totalInteractions} interaction{conv.totalInteractions !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

