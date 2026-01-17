/**
 * LLM Page Component
 * ChatGPT-style interface with sidebar for chat history
 */

"use client";

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { Send, Loader2, Sparkles, FileText, X, Download, Plus, Search, MoreVertical, Trash2, ChevronDown, Menu, MessageSquare } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Skeleton, ChatListSkeleton, MessageSkeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import ConfirmationModal from "./ConfirmationModal";
import ChartRenderer from "@/components/charts/ChartRenderer";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  files?: UploadedFile[];
  showPDFButton?: boolean; // Only show PDF button if user requested it
  chartData?: {
    type: "line" | "bar" | "pie" | "area";
    data: any[];
    xKey: string;
    yKey: string;
    title?: string;
  };
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

interface LLMPageProps {
  agentId?: string;
}

export default function LLMPage({ agentId }: LLMPageProps) {
  const { colors, themeClasses } = useTheme();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ chatId: string; title: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load chats on mount
  useEffect(() => {
    loadChats();
  }, []);

  // Load current chat messages
  useEffect(() => {
    // Always clear messages and files first when chat changes
    setMessages([]);
    setUploadedFiles([]);
    
    if (currentChatId) {
      loadChat(currentChatId);
    }
  }, [currentChatId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [currentChatId]);

  const loadChats = async () => {
    setLoadingChats(true);
    try {
      const response = await fetch("/api/llm/chats");
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
        // Auto-select first chat if available
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
    // Clear messages and files before loading to prevent showing old data
    setMessages([]);
    setUploadedFiles([]);
    try {
      const response = await fetch(`/api/llm/chats/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        // Only set messages if they exist and are an array
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
        setUploadedFiles([]); // Clear uploaded files when creating new chat
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

  const updateChatTitle = async (chatId: string, newTitle: string) => {
    try {
      await fetch(`/api/llm/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c))
      );
    } catch (error) {
      console.error("Failed to update chat title:", error);
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    // Create chat if none exists
    let chatId = currentChatId;
    if (!chatId) {
      const response = await fetch("/api/llm/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.trim().substring(0, 50) }),
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
      content: input.trim(),
      timestamp: new Date().toISOString(),
      files: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setStreaming(true);

    // Add placeholder assistant message
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.slice(-10),
          agentId: agentId,
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
        throw new Error(errorData.error || "Failed to get response");
      }

      const data = await response.json();
      
      // Parse chart data from response if present
      let chartData: Message["chartData"] = undefined;
      const responseContent = data.message || data.content || "";
      
      // Look for chart data in <!--CHART_DATA--> blocks
      const chartDataMatch = responseContent.match(/<!--CHART_DATA-->([\s\S]*?)<!--\/CHART_DATA-->/);
      if (chartDataMatch) {
        try {
          const chartJson = JSON.parse(chartDataMatch[1].trim());
          if (chartJson.chart) {
            chartData = chartJson.chart;
          }
        } catch (e) {
          console.error("Failed to parse chart data:", e);
        }
      }
      
      // Remove chart data markers from content
      let cleanContent = responseContent.replace(/<!--CHART_DATA-->[\s\S]*?<!--\/CHART_DATA-->/g, "").trim();
      
      // Check if user requested a PDF
      const userMessageLower = userMessage.content.toLowerCase();
      const pdfKeywords = ['pdf', 'download as pdf', 'export as pdf', 'save as pdf', 'create pdf', 'generate pdf', 'make pdf'];
      const requestedPDF = pdfKeywords.some(keyword => userMessageLower.includes(keyword));
      
      const assistantMessage: Message = {
        role: "assistant",
        content: cleanContent || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date().toISOString(),
        showPDFButton: requestedPDF, // Only show PDF button if user requested it
        chartData: chartData,
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);

      // Save messages to chat
      if (chatId) {
        await fetch(`/api/llm/chats/${chatId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages }),
        });
      }

      // Update chat title from first user message if it's still "New Chat"
      if (chatId && newMessages.length === 2) {
        const firstUserMsg = newMessages.find((m) => m.role === "user");
        if (firstUserMsg) {
          const title = firstUserMsg.content.substring(0, 50);
          updateChatTitle(chatId, title);
        }
      }
    } catch (error: any) {
      console.error("Failed to send message:", error);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          role: "assistant",
          content: error.message || "I'm sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
          showPDFButton: false, // Don't show PDF button on error messages
        };
        return newMessages;
      });
    } finally {
      setLoading(false);
      setStreaming(false);
      setUploadedFiles([]);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as any);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf") {
        alert(`Only PDF files are supported. ${file.name} is not a PDF.`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "llm-chat");

        const uploadResponse = await fetch("/api/llm/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const uploadData = await uploadResponse.json();
        newFiles.push({
          id: uploadData.id || Date.now().toString(),
          name: file.name,
          url: uploadData.url,
          type: file.type,
          size: file.size,
          extractedText: uploadData.extractedText,
        });
      } catch (error: any) {
        console.error(`Failed to upload ${file.name}:`, error);
        alert(`Failed to upload ${file.name}: ${error.message}`);
      }
    }

    setUploadedFiles((prev) => [...prev, ...newFiles]);
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const downloadFile = (file: UploadedFile) => {
    window.open(file.url, "_blank");
  };

  const downloadAsPDF = async (content: string, title: string = "Drift Response") => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, margin);

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");

      const cleanContent = content
        .replace(/#{1,6}\s+/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`(.*?)`/g, "$1");

      const lines = doc.splitTextToSize(cleanContent, maxWidth);
      let y = margin + 10;

      lines.forEach((line: string) => {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 7;
      });

      doc.save(`${title.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head><title>${title}</title></head>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h1>${title}</h1>
              <pre style="white-space: pre-wrap;">${content}</pre>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`flex h-full ${colors.bg}`}>
      {/* Mobile Sidebar Toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition"
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
        } fixed md:static inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-[#242423] flex flex-col transition-transform duration-300`}
      >
        {/* Header */}
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 hover:bg-white/10 rounded transition"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4 text-white/60" />
          </button>
          <Tooltip content="Start a new conversation">
            <button
              onClick={createNewChat}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/20 hover:bg-white/5 transition text-white text-sm"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
          </Tooltip>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
            <input
              type="text"
              placeholder="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-500/50"
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
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5"
                  }`}
                >
                  <span className="flex-1 truncate text-sm">{chat.title}</span>
                  <Tooltip content="Delete chat">
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden md:ml-0">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {loadingMessages ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <MessageSkeleton key={i} />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
              <div className="mb-6">
                <img
                  src="/brand/logo-circle.png"
                  alt="Drift Logo"
                  className="w-16 h-16 rounded-full object-cover mb-4 mx-auto"
                />
                <h2 className="text-2xl font-semibold text-white text-center mb-2">
                  How can I help you today?
                </h2>
                <p className="text-white/60 text-center text-sm">
                  Ask me anything and I'll do my best to assist you. You can upload PDFs for context too!
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-4 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                  )}
                  
                  {/* Chart rendering for assistant messages - render before message bubble */}
                  {message.role === "assistant" && message.chartData && (
                    <div className="flex-1 max-w-[85%] mb-4">
                      <ChartRenderer chartData={message.chartData} />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-orange-600 text-white"
                        : "bg-white/10 text-white border border-white/20"
                    }`}
                  >
                  {message.role === "assistant" && message.content && message.showPDFButton && (
                    <div className="flex justify-end mb-2">
                      <Tooltip content="Download response as PDF">
                        <button
                          onClick={() => downloadAsPDF(message.content, "Drift Response")}
                          className="text-xs text-white/60 hover:text-white/90 transition flex items-center gap-1"
                        >
                          <FileText className="h-3 w-3" />
                          <span>PDF</span>
                        </button>
                      </Tooltip>
                    </div>
                  )}
                    <div className="whitespace-pre-wrap break-words">
                      {message.content || (streaming && index === messages.length - 1 ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="opacity-70">Drift is thinking...</span>
                        </span>
                      ) : null)}
                    </div>
                    {message.files && message.files.length > 0 && (
                      <div className="mt-3 space-y-2 pt-3 border-t border-white/20">
                        {message.files.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2"
                          >
                            <FileText className="h-4 w-4 flex-shrink-0" />
                            <span className="text-sm flex-1 truncate">{file.name}</span>
                            <button
                              onClick={() => downloadFile(file)}
                              className="p-1 hover:bg-white/20 rounded transition"
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-medium">You</span>
                    </div>
                  )}
                </div>
              ))}
              {streaming && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-white/10 text-white border border-white/20 rounded-2xl px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-white/10 bg-[#242423]">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <form onSubmit={sendMessage} className="relative">
              {uploadedFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 border border-white/20"
                    >
                      <FileText className="h-4 w-4 text-orange-400" />
                      <span className="text-sm text-white/90 truncate max-w-[200px]">
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 hover:bg-white/20 rounded transition"
                        title="Remove file"
                      >
                        <X className="h-3 w-3 text-white/60" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 bg-white/5 rounded-2xl border border-white/10 focus-within:border-orange-500/50 focus-within:bg-white/10 transition">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Tooltip content="Upload PDF file">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || loading}
                    className="p-2 text-white/60 hover:text-white transition ml-2 disabled:opacity-50 flex-shrink-0"
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span className="text-xl">+</span>
                    )}
                  </button>
                </Tooltip>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  rows={1}
                  className="flex-1 bg-transparent text-white placeholder-white/50 resize-none outline-none px-2 py-3 text-sm max-h-[200px] overflow-y-auto"
                  disabled={loading}
                />
                <div className="flex items-center gap-2 pr-2 flex-shrink-0">
                  <Tooltip content="Voice input (coming soon)">
                    <button
                      type="button"
                      className="p-2 text-white/60 hover:text-white transition"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                  <Tooltip content={input.trim() ? "Send message" : "Type a message to send"}>
                    <button
                      type="submit"
                      disabled={!input.trim() || loading}
                      className="p-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </Tooltip>
                </div>
              </div>
              <p className="text-xs text-white/40 mt-2 text-center">
                Drift can make mistakes. Check important info.
              </p>
            </form>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!showDeleteConfirm}
        title="Delete Chat"
        message={`Are you sure you want to delete "${showDeleteConfirm?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={confirmDeleteChat}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  );
}
