/**
 * Chat Interface Component
 * Real-time chat interface for chat agents
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatInterfaceProps {
  agentId: string;
  conversationId?: string;
  onConversationCreated?: (conversationId: string) => void;
}

export default function ChatInterface({
  agentId,
  conversationId: initialConversationId,
  onConversationCreated,
}: ChatInterfaceProps) {
  const { theme, colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load existing conversation if conversationId provided
  useEffect(() => {
    if (initialConversationId) {
      loadConversation(initialConversationId);
    }
  }, [initialConversationId]);

  const loadConversation = async (convId: string) => {
    try {
      const response = await fetch(`/api/conversations?channelId=${convId}`);
      if (response.ok) {
        const conversations = await response.json();
        if (conversations.length > 0) {
          const conv = conversations[0];
          setConversationId(conv.id);
          setMessages(conv.transcript || []);
        }
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const createConversation = async () => {
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          modality: "chat",
          channelId: `chat-${Date.now()}`,
        }),
      });

      if (response.ok) {
        const conversation = await response.json();
        setConversationId(conversation.id);
        if (onConversationCreated) {
          onConversationCreated(conversation.id);
        }
        return conversation.id;
      } else {
        throw new Error("Failed to create conversation");
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
      throw error;
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Create conversation if needed
      let convId = conversationId;
      if (!convId) {
        convId = await createConversation();
      }

      // Send message
      const response = await fetch(`/api/conversations/${convId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Failed to send message");
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || data.output || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Failed to send message:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: error.message || "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col h-full ${colors.bg}`}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className={`text-center ${colors.textTertiary} mt-8`}>
            <p>Start a conversation with your AI agent</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-3xl px-4 py-2 ${
                  message.role === "user"
                    ? `${colors.buttonPrimary} text-white`
                    : `${colors.cardBg} ${colors.border} border ${colors.text}`
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className={`text-xs mt-1 ${
                  message.role === "user" ? "text-white/70" : colors.textTertiary
                }`}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className={`${colors.cardBg} ${colors.border} border rounded-3xl px-4 py-2`}>
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={`border-t ${colors.border} p-4`}>
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
            className={`flex-1 rounded-2xl border ${colors.border} ${colors.inputBg} px-4 py-2 ${colors.text} placeholder:${colors.textTertiary} focus:border-[#f97316] focus:outline-none disabled:opacity-50`}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className={`px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}








