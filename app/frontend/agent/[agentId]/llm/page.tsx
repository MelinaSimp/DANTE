// app/frontend/agent/[agentId]/llm/page.tsx - Frontend LLM Page with White-on-White Theme
"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { Send, Loader2, FileText, X, Download, Plus, Search, Trash2, Menu, MessageSquare, ArrowLeft, Save, Upload } from "lucide-react";
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
  const [currentGuideline, setCurrentGuideline] = useState<{ id?: string; name: string; template?: string; pdfUrl?: string | null; pdfExtractedText?: string | null; imageInstructions?: string | null; pdfAnnotations?: any[] | null; isAgentTemplate: boolean } | null>(null);
  const [savingGuideline, setSavingGuideline] = useState(false);
  const [uploadingPDF, setUploadingPDF] = useState(false);
  const [templateMode, setTemplateMode] = useState<"pdf" | "text">("text");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          id: g.id,
          name: g.name || "Unnamed Guidelines",
          template: g.template || "",
          isAgentTemplate: g.is_agent_template ?? g.isAgentTemplate ?? true,
          pdfUrl: g.pdf_url || null,
          pdfExtractedText: g.pdf_extracted_text || null,
          imageInstructions: g.image_instructions || null,
          pdfAnnotations: g.pdf_annotations || [],
        }));
        setGuidelines(mappedGuidelines);
        if (mappedGuidelines.length > 0 && !currentGuideline) {
          const firstGuideline = mappedGuidelines[0];
          setCurrentGuideline(firstGuideline);
          setTemplateMode(firstGuideline.pdfUrl ? "pdf" : "text");
        } else if (mappedGuidelines.length === 0) {
          setCurrentGuideline({ name: "Default Guidelines", template: "", pdfUrl: null, pdfExtractedText: null, imageInstructions: null, pdfAnnotations: [], isAgentTemplate: true });
          setTemplateMode("text");
        } else if (currentGuideline) {
          // Update mode based on current guideline if it exists
          setTemplateMode(currentGuideline.pdfUrl ? "pdf" : "text");
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

  const handlePDFUpload = async (file: File) => {
    setUploadingPDF(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/llm/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentGuideline((prev: any) => ({
          ...prev,
          pdfUrl: data.url,
          pdfExtractedText: data.extractedText,
          template: "", // Clear text template when PDF is uploaded
        }));
      } else {
        const error = await response.json();
        console.error("PDF upload failed:", error);
        alert(`Failed to upload PDF: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to upload PDF:", error);
      alert("Failed to upload PDF. Please try again.");
    } finally {
      setUploadingPDF(false);
    }
  };

  const saveGuideline = async () => {
    if (!currentGuideline || (!currentGuideline.template?.trim() && !currentGuideline.pdfUrl)) return;
    
    setSavingGuideline(true);
    try {
      const url = `/api/llm/guidelines`;
      
      const method = currentGuideline.id ? "PUT" : "POST";
      const body: any = {
        name: currentGuideline.name,
        isAgentTemplate: currentGuideline.isAgentTemplate,
        imageInstructions: currentGuideline.imageInstructions || null,
        pdfAnnotations: currentGuideline.pdfAnnotations || [],
      };
      
      // Include template OR PDF, not both
      if (currentGuideline.pdfUrl) {
        body.pdfUrl = currentGuideline.pdfUrl;
        body.pdfExtractedText = currentGuideline.pdfExtractedText || null;
        body.template = "";
      } else {
        body.template = currentGuideline.template || "";
        body.pdfUrl = null;
        body.pdfExtractedText = null;
      }
      
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
            pdfUrl: data.guideline.pdf_url,
            pdfExtractedText: data.guideline.pdf_extracted_text,
            template: data.guideline.template || "",
            imageInstructions: data.guideline.image_instructions || null,
            pdfAnnotations: data.guideline.pdf_annotations || [],
          });
        }
        // Show success feedback (optional - could add toast notification)
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to save guideline" }));
        alert(`Failed to save guideline: ${errorData.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Failed to save guideline:", error);
      alert(`Failed to save guideline: ${error.message || "Network error"}`);
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
    <div className="flex h-screen bg-[#f5f5f7]" style={{ background: '#f5f5f7' }}>
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

      {/* Sidebar - Apple Glass Style */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } fixed md:static inset-y-0 left-0 z-50 w-64 border-r border-gray-300/10 bg-gray-200/90 backdrop-blur-sm shadow-2xl flex flex-col transition-transform duration-300`}
      >
        {/* Tabs - Polished */}
        <div className="flex border-b border-gray-200/40 bg-white/50 backdrop-blur-sm">
          <button
            onClick={() => setSidebarTab("chats")}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative ${
              sidebarTab === "chats"
                ? "text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {sidebarTab === "chats" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"></span>
            )}
            Chats
          </button>
          <button
            onClick={() => setSidebarTab("guidelines")}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative ${
              sidebarTab === "guidelines"
                ? "text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {sidebarTab === "guidelines" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"></span>
            )}
            Guidelines
          </button>
        </div>

        {/* Header - Polished */}
        <div className="p-4 border-b border-gray-200/40 bg-white/50 backdrop-blur-sm flex items-center gap-2">
          <button
            onClick={() => router.push(`/frontend/agent/${agentId}`)}
            className="md:hidden p-2 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4 text-gray-700" />
          </button>
          <Tooltip content="Start a new conversation">
            <div className="flex-1 relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-2xl blur opacity-50 group-hover:opacity-60 transition-opacity"></div>
              <button
                onClick={createNewChat}
                className="relative flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-900 text-sm font-semibold w-full shadow-sm"
              >
                <Plus className="h-4 w-4" />
                New chat
              </button>
            </div>
          </Tooltip>
        </div>

        {sidebarTab === "chats" ? (
          <>
            {/* Search - Polished */}
            <div className="p-4 border-b border-gray-200/40 bg-white/50 backdrop-blur-sm">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-sm placeholder:text-gray-400 shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Chat List - Polished */}
            <div className="flex-1 overflow-y-auto p-3">
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
            <div className="space-y-1.5">
              {filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => {
                    setCurrentChatId(chat.id);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={`group flex items-center gap-2 px-4 py-2.5 rounded-2xl cursor-pointer transition-all duration-200 ${
                    currentChatId === chat.id
                      ? "bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-md"
                      : "text-gray-700 hover:bg-gray-100/80 active:scale-[0.98]"
                  }`}
                >
                  <span className={`flex-1 truncate text-sm font-medium ${currentChatId === chat.id ? "text-white" : "text-gray-900"}`}>
                    {chat.title}
                  </span>
                  <Tooltip content="Delete chat">
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all ${
                        currentChatId === chat.id
                          ? "hover:bg-white/20 text-white"
                          : "hover:bg-gray-200 text-gray-600"
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
          </div>
          </>
        ) : (
          /* Guidelines Panel - Polished Design */
          <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-gray-50/50 to-white">
            {/* Header with Select */}
            <div className="p-4 border-b border-gray-200/60 bg-white/80 backdrop-blur-sm">
              <select
                value={currentGuideline?.id || "new"}
                onChange={(e) => {
                    if (e.target.value === "new") {
                      setCurrentGuideline({ name: "New Guidelines", template: "", pdfUrl: null, pdfExtractedText: null, imageInstructions: null, pdfAnnotations: [], isAgentTemplate: true });
                      setTemplateMode("text");
                  } else {
                    const guideline = guidelines.find(g => g.id === e.target.value);
                    if (guideline) {
                      setCurrentGuideline({
                        ...guideline,
                        isAgentTemplate: guideline.isAgentTemplate ?? guideline.is_agent_template ?? true,
                      });
                      setTemplateMode(guideline.pdfUrl ? "pdf" : "text");
                    }
                  }
                }}
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 bg-white text-gray-900 text-sm font-medium shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="new">+ New Guidelines</option>
                {guidelines.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Guidelines Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Guidelines Name
                </label>
                <input
                  type="text"
                  value={currentGuideline?.name || ""}
                  onChange={(e) => setCurrentGuideline(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 bg-white text-gray-900 text-sm font-medium shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="Enter a descriptive name..."
                />
              </div>
              
              {/* Input Format Toggle */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Input Format
                </label>
                <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
                  <button
                    onClick={() => {
                      setTemplateMode("text");
                      setCurrentGuideline(prev => prev ? { ...prev, pdfUrl: null, pdfExtractedText: null } : null);
                    }}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      templateMode === "text"
                        ? "bg-white text-gray-900 shadow-md border border-gray-200"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => {
                      setTemplateMode("pdf");
                      setCurrentGuideline(prev => prev ? { ...prev, template: "" } : null);
                    }}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      templateMode === "pdf"
                        ? "bg-white text-gray-900 shadow-md border border-gray-200"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    PDF
                  </button>
                </div>
              </div>

              {/* Guidelines Content Area */}
              <div className="flex-1 min-h-0 space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Guidelines {templateMode === "pdf" ? "PDF" : "Text"}
                </label>
                {templateMode === "pdf" ? (
                  currentGuideline?.pdfUrl ? (
                    <div className="w-full min-h-[240px] px-6 py-8 rounded-2xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-inner flex flex-col items-center justify-center gap-4">
                      <div className="p-4 bg-blue-50 rounded-2xl">
                        <FileText className="h-10 w-10 text-blue-600" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-semibold text-gray-900">PDF Template Uploaded</p>
                        <a
                          href={currentGuideline.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium transition-colors"
                        >
                          {currentGuideline.pdfUrl.split("/").pop() || "View PDF"}
                        </a>
                      </div>
                      <button
                        onClick={() => setCurrentGuideline((prev: any) => ({ ...prev, pdfUrl: null, pdfExtractedText: null }))}
                        className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 hover:border-red-300 transition-all"
                      >
                        Remove PDF
                      </button>
                    </div>
                  ) : (
                    <div className="w-full min-h-[240px] px-6 py-8 rounded-2xl border-2 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-gray-400 hover:bg-gray-50/50 transition-all group">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handlePDFUpload(file);
                          }
                        }}
                        className="hidden"
                        id="pdf-upload-input"
                        disabled={uploadingPDF}
                      />
                      <label htmlFor="pdf-upload-input" className="cursor-pointer flex flex-col items-center gap-3">
                        {uploadingPDF ? (
                          <>
                            <div className="p-3 bg-gray-100 rounded-2xl">
                              <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                            </div>
                            <span className="text-xs font-medium text-gray-500">Uploading PDF...</span>
                          </>
                        ) : (
                          <>
                            <div className="p-4 bg-gray-100 rounded-2xl group-hover:bg-gray-200 transition-colors">
                              <Upload className="h-8 w-8 text-gray-500 group-hover:text-gray-700 transition-colors" />
                            </div>
                            <div className="text-center space-y-1">
                              <span className="text-sm font-medium text-gray-700 block">
                                Click to upload PDF template
                              </span>
                              <span className="text-xs text-gray-400 block">
                                Only PDF files are supported
                              </span>
                            </div>
                          </>
                        )}
                      </label>
                    </div>
                  )
                ) : (
                  <textarea
                    value={currentGuideline?.template || ""}
                    onChange={(e) => setCurrentGuideline(prev => prev ? { ...prev, template: e.target.value, pdfUrl: null, pdfExtractedText: null } : null)}
                    className="w-full h-full min-h-[320px] px-4 py-3 rounded-2xl border border-gray-300 bg-white text-gray-900 text-sm leading-relaxed shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono resize-none placeholder:text-gray-400"
                    placeholder={`Enter guidelines that the AI must follow in every chat:

Example:
- Always be professional and helpful
- If you don't know something, say "I don't have that information, but I can connect you with someone who can help"
- Use the customer's name when available
- Keep responses concise and clear
- Ask clarifying questions if the request is unclear`}
                  />
                )}
              </div>

              {/* Image Instructions */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Image Instructions
                </label>
                <textarea
                  value={currentGuideline?.imageInstructions || ""}
                  onChange={(e) => setCurrentGuideline(prev => prev ? { ...prev, imageInstructions: e.target.value } : null)}
                  className="w-full min-h-[120px] px-4 py-3 rounded-2xl border border-gray-300 bg-white text-gray-900 text-sm leading-relaxed shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none placeholder:text-gray-400"
                  placeholder="Instructions for the AI about image handling:
- Where to keep/store images (e.g., 'Store images in the /images folder')
- How to write when images are involved (e.g., 'Always describe images in detail before referencing them')
- Image format preferences (e.g., 'Use PNG for screenshots, JPG for photos')
- Image naming conventions (e.g., 'Name images descriptively: product-name-screenshot.png')"
                />
              </div>

              {/* PDF Annotations - Only show when PDF is uploaded */}
              {currentGuideline?.pdfUrl && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    PDF Annotations
                  </label>
                  <div className="space-y-2">
                    {(currentGuideline.pdfAnnotations || []).map((annotation: any, index: number) => (
                      <div key={index} className="p-3 rounded-xl border border-gray-300 bg-white space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={annotation.page || ""}
                              onChange={(e) => {
                                const updated = [...(currentGuideline.pdfAnnotations || [])];
                                updated[index] = { ...updated[index], page: parseInt(e.target.value) || 1 };
                                setCurrentGuideline(prev => prev ? { ...prev, pdfAnnotations: updated } : null);
                              }}
                              placeholder="Page"
                              className="w-20 px-2 py-1 rounded-lg border border-gray-300 text-sm"
                            />
                            <input
                              type="text"
                              value={annotation.section || ""}
                              onChange={(e) => {
                                const updated = [...(currentGuideline.pdfAnnotations || [])];
                                updated[index] = { ...updated[index], section: e.target.value };
                                setCurrentGuideline(prev => prev ? { ...prev, pdfAnnotations: updated } : null);
                              }}
                              placeholder="Section (optional)"
                              className="flex-1 px-2 py-1 rounded-lg border border-gray-300 text-sm"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const updated = (currentGuideline.pdfAnnotations || []).filter((_: any, i: number) => i !== index);
                              setCurrentGuideline(prev => prev ? { ...prev, pdfAnnotations: updated } : null);
                            }}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <textarea
                          value={annotation.annotation || ""}
                          onChange={(e) => {
                            const updated = [...(currentGuideline.pdfAnnotations || [])];
                            updated[index] = { ...updated[index], annotation: e.target.value };
                            setCurrentGuideline(prev => prev ? { ...prev, pdfAnnotations: updated } : null);
                          }}
                          placeholder="Annotation/Note about this section..."
                          className="w-full min-h-[60px] px-2 py-1 rounded-lg border border-gray-300 text-sm resize-none"
                        />
                        <input
                          type="text"
                          value={annotation.highlight || ""}
                          onChange={(e) => {
                            const updated = [...(currentGuideline.pdfAnnotations || [])];
                            updated[index] = { ...updated[index], highlight: e.target.value };
                            setCurrentGuideline(prev => prev ? { ...prev, pdfAnnotations: updated } : null);
                          }}
                          placeholder="Key points to emphasize (optional)"
                          className="w-full px-2 py-1 rounded-lg border border-gray-300 text-sm"
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const updated = [...(currentGuideline.pdfAnnotations || []), { page: 1, section: "", annotation: "", highlight: "" }];
                        setCurrentGuideline(prev => prev ? { ...prev, pdfAnnotations: updated } : null);
                      }}
                      className="w-full px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-600 text-sm font-medium hover:border-gray-400 hover:bg-gray-100 transition-all"
                    >
                      + Add Annotation
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Add annotations to help the AI learn from your PDF template. Reference specific pages and sections.
                  </p>
                </div>
              )}

              {/* Save Button with Gradient Halo */}
              <div className="pt-2">
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-400 via-pink-500 to-blue-500 rounded-2xl blur opacity-60 group-hover:opacity-75 transition-opacity"></div>
                  <button
                    onClick={saveGuideline}
                    disabled={savingGuideline || (!currentGuideline?.template?.trim() && !currentGuideline?.pdfUrl) || uploadingPDF}
                    className="relative w-full px-5 py-3 rounded-2xl bg-gray-900 text-white font-semibold text-sm shadow-lg hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 flex items-center justify-center gap-2"
                  >
                    {savingGuideline ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save Guidelines</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {!currentChatId && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-gray-50/30 to-white">
            <div className="text-center max-w-md px-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center mx-auto mb-6 shadow-lg">
                <MessageSquare className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-3xl font-semibold text-gray-900 mb-2">Start a conversation</h2>
              <p className="text-gray-600 mb-8 text-sm">Ask me anything or upload a file to get started</p>
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-2xl blur opacity-60 group-hover:opacity-75 transition-opacity"></div>
                <button
                  onClick={createNewChat}
                  className="relative px-6 py-3 rounded-2xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 active:scale-95 transition-all shadow-lg"
                >
                  New Chat
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Messages - Polished */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-gray-50/30 to-white">
              {loadingMessages ? (
                <MessageSkeleton />
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} items-start gap-3`}
                  >
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <MessageSquare className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-gray-900 to-gray-800 text-white"
                          : "bg-white border border-gray-200 text-gray-900 shadow-md"
                      }`}
                    >
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${message.role === "user" ? "text-white" : "text-gray-900"}`}>
                        {message.content}
                      </p>
                      {message.files && message.files.length > 0 && (
                        <div className={`mt-3 space-y-1.5 pt-2 border-t ${message.role === "user" ? "border-white/20" : "border-gray-200/50"}`}>
                          {message.files.map((file) => (
                            <div key={file.id} className={`flex items-center gap-2 text-xs ${message.role === "user" ? "text-white/80" : "text-gray-600"}`}>
                              <FileText className="h-3.5 w-3.5" />
                              <span className="font-medium">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.showPDFButton && message.role === "assistant" && (
                        <button
                          onClick={downloadAsPDF}
                          className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:border-gray-400 text-xs font-medium transition-all"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download as PDF
                        </button>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-white text-xs font-semibold">U</span>
                      </div>
                    )}
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-md">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area - Polished */}
            <div className="border-t border-gray-200 bg-white/95 backdrop-blur-sm p-4 shadow-lg">
              <form onSubmit={sendMessage} className="flex items-end gap-3">
                <div className="flex-1 rounded-2xl border border-gray-300 bg-white p-3 flex items-end gap-2 shadow-sm hover:border-gray-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
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
                    className="flex-1 resize-none border-none outline-none text-gray-900 placeholder:text-gray-400 text-sm bg-transparent font-medium"
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
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-2xl blur opacity-60 group-hover:opacity-75 transition-opacity"></div>
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="relative p-3.5 rounded-2xl bg-gray-900 text-white hover:bg-gray-800 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
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


