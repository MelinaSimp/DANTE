// app/frontend/agent/[agentId]/llm/page.tsx - Frontend LLM Page with White-on-White Theme
"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { Send, Loader2, FileText, X, Download, Plus, Search, Trash2, Menu, MessageSquare, ArrowLeft, Save } from "lucide-react";
import { Skeleton, ChatListSkeleton, MessageSkeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import ConfirmationModal from "@/components/frontend/ConfirmationModal";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  files?: UploadedFile[];
  showPDFButton?: boolean;
}

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  extractedText?: string;
}

interface Chat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

export default function FrontendLLMPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.agentId as string;
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ chatId: string; title: string } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"chats" | "guidelines">("chats");
  const [guidelines, setGuidelines] = useState<any[]>([]);
  const [currentGuideline, setCurrentGuideline] = useState<{ id?: string; name: string; template: string; isAgentTemplate: boolean } | null>(null);
  const [savingGuideline, setSavingGuideline] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    setMessages([]);
    setUploadedFiles([]);
    if (currentChatId) {
      loadChat(currentChatId);
    }
  }, [currentChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentChatId]);

  const loadGuidelines = async () => {
    try {
      const params = new URLSearchParams();
      if (agentId) params.append("agentId", agentId);
      if (currentChatId) params.append("chatId", currentChatId);
      
      const response = await fetch(`/api/llm/guidelines?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        const mappedGuidelines = (data.guidelines || []).map((g: any) => ({
          ...g,
          isAgentTemplate: g.is_agent_template ?? g.isAgentTemplate ?? true,
        }));
        setGuidelines(mappedGuidelines);
        if (mappedGuidelines.length > 0 && !currentGuideline) {
          setCurrentGuideline(mappedGuidelines[0]);
        } else if (mappedGuidelines.length === 0) {
          setCurrentGuideline({ name: "Default Template", template: "", isAgentTemplate: true });
        }
      }
    } catch (error) {
      console.error("Failed to load guidelines:", error);
    }
  };

  useEffect(() => {
    if (sidebarTab === "guidelines") {
      loadGuidelines();
    }
  }, [sidebarTab, agentId, currentChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveGuideline = async () => {
    if (!currentGuideline || !currentGuideline.template.trim()) return;
    
    setSavingGuideline(true);
    try {
      const url = currentGuideline.id 
        ? `/api/llm/guidelines`
        : `/api/llm/guidelines`;
      
      const method = currentGuideline.id ? "PUT" : "POST";
      const body: any = {
        name: currentGuideline.name,
        template: currentGuideline.template,
        isAgentTemplate: currentGuideline.isAgentTemplate,
      };
      
      if (currentGuideline.id) {
        body.id = currentGuideline.id;
      } else {
        if (agentId) body.agentId = agentId;
        if (currentChatId) body.chatId = currentChatId;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        await loadGuidelines();
        if (data.guideline) {
          setCurrentGuideline({
            ...data.guideline,
            isAgentTemplate: data.guideline.is_agent_template ?? data.guideline.isAgentTemplate ?? true,
          });
        }
      }
    } catch (error) {
      console.error("Failed to save guideline:", error);
    } finally {
      setSavingGuideline(false);
    }
  };

  const loadChats = async () => {
    setLoadingChats(true);
    try {
      const response = await fetch("/api/llm/chats");
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
        if (data.chats && data.chats.length > 0 && !currentChatId) {
          setCurrentChatId(data.chats[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setLoadingChats(false);
    }
  };

  const loadChat = async (chatId: string) => {
    setLoadingMessages(true);
    setMessages([]);
    setUploadedFiles([]);
    try {
      const response = await fetch(`/api/llm/chats/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        const chatMessages = data.chat?.messages || [];
        setMessages(Array.isArray(chatMessages) ? chatMessages : []);
      }
    } catch (error) {
      console.error("Failed to load chat:", error);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const createNewChat = async () => {
    try {
      const response = await fetch("/api/llm/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (response.ok) {
        const data = await response.json();
        setChats((prev) => [data.chat, ...prev]);
        setCurrentChatId(data.chat.id);
        setMessages([]);
        setInput("");
        setUploadedFiles([]);
      }
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chat = chats.find((c) => c.id === chatId);
    setShowDeleteConfirm({ chatId, title: chat?.title || "this chat" });
  };

  const confirmDeleteChat = async () => {
    if (!showDeleteConfirm) return;
    try {
      const response = await fetch(`/api/llm/chats/${showDeleteConfirm.chatId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setChats((prev) => prev.filter((c) => c.id !== showDeleteConfirm.chatId));
        if (currentChatId === showDeleteConfirm.chatId) {
          setCurrentChatId(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    } finally {
      setShowDeleteConfirm(null);
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    let chatId = currentChatId;
    if (!chatId) {
      const response = await fetch("/api/llm/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.slice(0, 50) }),
      });
      if (response.ok) {
        const data = await response.json();
        chatId = data.chat.id;
        setCurrentChatId(chatId);
        setChats((prev) => [data.chat, ...prev]);
      }
    }

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
      files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setUploadedFiles([]);

    try {
      const response = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          history: messages.slice(-10), // Pass conversation history
          agentId: agentId,
          chatId: chatId,
          files: uploadedFiles.map((f) => ({
            id: f.id,
            name: f.name,
            url: f.url,
            extractedText: f.extractedText,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send message");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || data.content || data.response || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date().toISOString(),
        showPDFButton: input.toLowerCase().includes("pdf") || input.toLowerCase().includes("download"),
      };

      const updatedMessages = [...messages, userMessage, assistantMessage];
      setMessages(updatedMessages);

      // Save messages to chat
      if (chatId) {
        await fetch(`/api/llm/chats/${chatId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages }),
        });

        // Update chat title from first user message if it's still "New Chat"
        const currentChat = chats.find((c) => c.id === chatId);
        if (currentChat && (currentChat.title === "New Chat" || currentChat.title === "")) {
          const title = userMessage.content.substring(0, 50);
          await fetch(`/api/llm/chats/${chatId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          // Update local state
          setChats((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, title } : c))
          );
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const downloadAsPDF = () => {
    const { jsPDF } = require("jspdf");
    const doc = new jsPDF();
    let y = 20;

    messages.forEach((msg) => {
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const role = msg.role === "user" ? "You" : "Assistant";
      doc.text(`${role}:`, 10, y);
      y += 7;
      const lines = doc.splitTextToSize(msg.content, 180);
      doc.text(lines, 10, y);
      y += lines.length * 7 + 5;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`chat-${currentChatId || "new"}.pdf`);
  };

  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-white">
      {/* Mobile Sidebar Toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-2xl border-2 border-black bg-white text-black hover:bg-gray-50 transition"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sidebar Overlay (Mobile) */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } fixed md:static inset-y-0 left-0 z-50 w-64 border-r-2 border-black bg-white flex flex-col transition-transform duration-300`}
      >
        {/* Tabs */}
        <div className="flex border-b-2 border-black">
          <button
            onClick={() => setSidebarTab("chats")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition ${
              sidebarTab === "chats"
                ? "bg-black text-white"
                : "bg-white text-black hover:bg-gray-50"
            }`}
          >
            Chats
          </button>
          <button
            onClick={() => setSidebarTab("guidelines")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition ${
              sidebarTab === "guidelines"
                ? "bg-black text-white"
                : "bg-white text-black hover:bg-gray-50"
            }`}
          >
            Guidelines
          </button>
        </div>

        {/* Header */}
        <div className="p-3 border-b-2 border-black flex items-center gap-2">
          <button
            onClick={() => router.push(`/frontend/agent/${agentId}`)}
            className="md:hidden p-1 hover:bg-gray-50 rounded transition"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4 text-black" />
          </button>
          <Tooltip content="Start a new conversation">
            <button
              onClick={createNewChat}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-2xl border-2 border-black hover:bg-gray-50 transition text-black text-sm"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
          </Tooltip>
        </div>

        {sidebarTab === "chats" ? (
          <>
            {/* Search */}
            <div className="p-3 border-b-2 border-black">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                <input
                  type="text"
                  placeholder="Search chats"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-2xl bg-white border-2 border-black text-black text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto">
          {loadingChats ? (
            <ChatListSkeleton />
          ) : filteredChats.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={searchQuery ? "No chats found" : "No chats yet"}
              description={searchQuery ? "Try a different search term" : "Start a conversation to see your chat history here"}
              action={!searchQuery ? { label: "New Chat", onClick: createNewChat } : undefined}
            />
          ) : (
            <div className="p-2 space-y-1">
              {filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => {
                    setCurrentChatId(chat.id);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-2xl cursor-pointer transition ${
                    currentChatId === chat.id
                      ? "bg-black text-white"
                      : "text-black hover:bg-gray-50"
                  }`}
                >
                  <span className="flex-1 truncate text-sm">{chat.title}</span>
                  <Tooltip content="Delete chat">
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
          </div>
          </>
        ) : (
          /* Guidelines Panel */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b-2 border-black flex items-center justify-between">
              <select
                value={currentGuideline?.id || "new"}
                onChange={(e) => {
                  if (e.target.value === "new") {
                    setCurrentGuideline({ name: "New Template", template: "", isAgentTemplate: true });
                  } else {
                    const guideline = guidelines.find(g => g.id === e.target.value);
                    if (guideline) {
                      setCurrentGuideline({
                        ...guideline,
                        isAgentTemplate: guideline.isAgentTemplate ?? guideline.is_agent_template ?? true,
                      });
                    }
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl border-2 border-black text-black text-sm bg-white focus:outline-none"
              >
                <option value="new">+ New Template</option>
                {guidelines.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} {g.isAgentTemplate ? "(Agent)" : "(Chat)"}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Template Name</label>
                <input
                  type="text"
                  value={currentGuideline?.name || ""}
                  onChange={(e) => setCurrentGuideline(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-black text-black text-sm bg-white focus:outline-none"
                  placeholder="Template name"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Scope</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentGuideline(prev => prev ? { ...prev, isAgentTemplate: true } : null)}
                    className={`flex-1 px-3 py-2 rounded-xl border-2 text-sm transition ${
                      currentGuideline?.isAgentTemplate
                        ? "border-black bg-black text-white"
                        : "border-gray-300 bg-white text-black hover:bg-gray-50"
                    }`}
                  >
                    Agent
                  </button>
                  <button
                    onClick={() => setCurrentGuideline(prev => prev ? { ...prev, isAgentTemplate: false } : null)}
                    className={`flex-1 px-3 py-2 rounded-xl border-2 text-sm transition ${
                      !currentGuideline?.isAgentTemplate
                        ? "border-black bg-black text-white"
                        : "border-gray-300 bg-white text-black hover:bg-gray-50"
                    }`}
                  >
                    Chat
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Template (use // or # for inline comments)
                </label>
                <textarea
                  value={currentGuideline?.template || ""}
                  onChange={(e) => setCurrentGuideline(prev => prev ? { ...prev, template: e.target.value } : null)}
                  className="w-full h-full min-h-[300px] px-3 py-2 rounded-xl border-2 border-black text-black text-sm bg-white focus:outline-none font-mono resize-none"
                  placeholder={`Example template with inline comments:

// This is a comment explaining what to do
When analyzing data, always:
1. Identify key metrics // Look for numbers and percentages
2. Note trends // Check for increases/decreases over time
3. Highlight anomalies // Flag anything unusual

# Another comment style
For spreadsheets, create visualizations automatically.`}
                />
              </div>

              <button
                onClick={saveGuideline}
                disabled={savingGuideline || !currentGuideline?.template.trim()}
                className="w-full px-4 py-2 rounded-xl border-2 border-black bg-black text-white hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Save className="h-4 w-4" />
                {savingGuideline ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {!currentChatId && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-white border-2 border-black flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-8 w-8 text-black" />
              </div>
              <h2 className="text-2xl font-light text-black mb-2">Start a conversation</h2>
              <p className="text-gray-600 mb-6">Ask me anything or upload a file to get started</p>
              <button
                onClick={createNewChat}
                className="px-6 py-2 rounded-2xl border-2 border-black bg-black text-white hover:bg-gray-800 transition"
              >
                New Chat
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingMessages ? (
                <MessageSkeleton />
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-black text-white"
                          : "bg-white border-2 border-black text-black"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {message.files && message.files.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {message.files.map((file) => (
                            <div key={file.id} className="flex items-center gap-2 text-xs opacity-80">
                              <FileText className="h-3 w-3" />
                              <span>{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.showPDFButton && message.role === "assistant" && (
                        <button
                          onClick={downloadAsPDF}
                          className="mt-2 flex items-center gap-2 px-3 py-1 rounded-lg border-2 border-black bg-white text-black hover:bg-gray-50 text-xs transition"
                        >
                          <Download className="h-3 w-3" />
                          Download as PDF
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border-2 border-black rounded-2xl px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-black" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t-2 border-black bg-white p-4">
              <form onSubmit={sendMessage} className="flex items-end gap-2">
                <div className="flex-1 rounded-2xl border-2 border-black bg-white p-3 flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(e);
                      }
                    }}
                    placeholder="Type your message..."
                    rows={1}
                    className="flex-1 resize-none border-none outline-none text-black placeholder-gray-400 text-sm bg-transparent"
                    style={{ maxHeight: "200px" }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      setUploading(true);
                      // Handle file upload here
                      setUploading(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:bg-gray-50 rounded-lg transition"
                  >
                    <FileText className="h-4 w-4 text-black" />
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-3 rounded-2xl bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <ConfirmationModal
          isOpen={!!showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(null)}
          onConfirm={confirmDeleteChat}
          title="Delete Chat"
          message={`Are you sure you want to delete "${showDeleteConfirm.title}"? This action cannot be undone.`}
        />
      )}
    </div>
  );
}


