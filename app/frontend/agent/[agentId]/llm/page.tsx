// app/frontend/agent/[agentId]/llm/page.tsx - Meeting Planner Page
"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { Send, Loader2, FileText, X, Download, Plus, Search, Trash2, Menu, MessageSquare, ArrowLeft, Save, Upload, CalendarPlus, Bell, Clock, CheckCircle2, BarChart3, CalendarClock, Mail } from "lucide-react";
import Link from "next/link";
import { ChatListSkeleton, MessageSkeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import ConfirmationModal from "@/components/frontend/ConfirmationModal";
import { useFeatures } from "@/hooks/useFeatures";

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["application/pdf", "text/plain", "text/csv", "image/png", "image/jpeg"];

// Email reminder template
function buildReminderHtml(step: { title: string; description: string; duration_minutes: number; priority: string }, stepDate: Date) {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a1a1a;">Upcoming: ${step.title}</h2>
    <p style="color: #555;">${step.description}</p>
    <div style="background: #f5f5f7; padding: 16px; border-radius: 12px; margin: 16px 0;">
      <p style="margin: 0; color: #333;"><strong>When:</strong> ${stepDate.toLocaleString()}</p>
      <p style="margin: 8px 0 0; color: #333;"><strong>Duration:</strong> ${step.duration_minutes} minutes</p>
      <p style="margin: 8px 0 0; color: #333;"><strong>Priority:</strong> ${step.priority}</p>
    </div>
    <p style="color: #888; font-size: 12px;">— Drift Meeting Planner</p>
  </div>`;
}

interface NextStep {
  title: string;
  description: string;
  suggested_date: string;
  suggested_time: string;
  duration_minutes: number;
  priority: "high" | "medium" | "low";
  assignee?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  files?: UploadedFile[];
  showPDFButton?: boolean;
  nextSteps?: NextStep[];
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
  const agentId = (params?.agentId as string) || "";
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
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatTitle, setEditingChatTitle] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"chats" | "guidelines">("chats");
  const [guidelines, setGuidelines] = useState<any[]>([]);
  const [currentGuideline, setCurrentGuideline] = useState<{ id?: string; name: string; template?: string; pdfUrl?: string | null; pdfExtractedText?: string | null; imageInstructions?: string | null; pdfAnnotations?: any[] | null; isAgentTemplate: boolean } | null>(null);
  const [savingGuideline, setSavingGuideline] = useState(false);
  const [uploadingPDF, setUploadingPDF] = useState(false);
  const [templateMode, setTemplateMode] = useState<"pdf" | "text">("text");
  const [meetingPdfUploading, setMeetingPdfUploading] = useState(false);
  const [meetingPdfFile, setMeetingPdfFile] = useState<UploadedFile | null>(null);
  const [calendarForm, setCalendarForm] = useState<{ stepIndex: number; msgIndex: number; name: string; phone: string; email: string } | null>(null);
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const [reminderPopover, setReminderPopover] = useState<{ stepIndex: number; msgIndex: number } | null>(null);
  const [calendarSuccess, setCalendarSuccess] = useState<string | null>(null);
  const [reminderSuccess, setReminderSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sendTodosPopover, setSendTodosPopover] = useState<{ msgIndex: number } | null>(null);
  const [matchedContacts, setMatchedContacts] = useState<{ name: string; email: string; steps: NextStep[] }[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [sendingTodos, setSendingTodos] = useState<Set<string>>(new Set());
  const [sentTodos, setSentTodos] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meetingPdfInputRef = useRef<HTMLInputElement>(null);
  const { features, loading: featuresLoading } = useFeatures();

  useEffect(() => {
    if (!featuresLoading && features.length > 0 && !features.includes("meeting_planner")) {
      router.replace("/agent");
    }
  }, [features, featuresLoading, router]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), type === "error" ? 5000 : 3000);
  };

  // Sidebar shell stripped — the orb layout is gone. Workspace nav is
  // the dashboard header; this page is reached via /agent or deep link.

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
        showToast("error", `Failed to upload PDF: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      showToast("error", "Failed to upload PDF. Please try again.");
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
        showToast("success", "Guidelines saved successfully");
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to save guideline" }));
        showToast("error", `Failed to save guideline: ${errorData.error || "Unknown error"}`);
      }
    } catch (error: any) {
      showToast("error", `Failed to save guideline: ${error.message || "Network error"}`);
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

  const startEditingChat = (chatId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chatId);
    setEditingChatTitle(title);
  };

  const saveEditingChat = async () => {
    if (!editingChatId || !editingChatTitle.trim()) {
      setEditingChatId(null);
      return;
    }
    try {
      await fetch(`/api/llm/chats/${editingChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: editingChatTitle.trim() }),
      });
      setChats((prev) => prev.map((c) => c.id === editingChatId ? { ...c, title: editingChatTitle.trim() } : c));
    } catch (err) {
      console.error("Failed to rename chat:", err);
    } finally {
      setEditingChatId(null);
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
      const rawContent = data.message || data.content || data.response || "I'm sorry, I couldn't generate a response.";
      const nextSteps = parseNextSteps(rawContent);
      const assistantMessage: Message = {
        role: "assistant",
        content: rawContent,
        timestamp: new Date().toISOString(),
        showPDFButton: input.toLowerCase().includes("pdf") || input.toLowerCase().includes("download"),
        nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
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

  // Parse next steps from assistant message content
  const parseNextSteps = (content: string): NextStep[] => {
    const steps: NextStep[] = [];
    const regex = /<!--NEXT_STEPS-->([\s\S]*?)<!--\/NEXT_STEPS-->/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.steps && Array.isArray(parsed.steps)) {
          steps.push(...parsed.steps);
        }
      } catch (e) {
        console.error("Failed to parse next steps:", e);
      }
    }
    return steps;
  };

  // Strip next steps blocks from content for display
  const stripNextStepsBlocks = (content: string): string => {
    return content.replace(/<!--NEXT_STEPS-->[\s\S]*?<!--\/NEXT_STEPS-->/g, "").trim();
  };

  // Upload meeting PDF and send it to the chat
  const handleMeetingPdfUpload = async (file: File) => {
    setMeetingPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/llm/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const uploaded: UploadedFile = {
          id: data.id || crypto.randomUUID(),
          name: file.name,
          url: data.url,
          type: file.type,
          size: file.size,
          extractedText: data.extractedText,
        };
        setMeetingPdfFile(uploaded);
        setUploadedFiles([uploaded]);

        // Auto-create chat and send analysis request
        let chatId = currentChatId;
        if (!chatId) {
          const chatResp = await fetch("/api/llm/chats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: `Meeting: ${file.name.replace(/\.pdf$/i, "")}` }),
          });
          if (chatResp.ok) {
            const chatData = await chatResp.json();
            chatId = chatData.chat.id;
            setCurrentChatId(chatId);
            setChats((prev) => [chatData.chat, ...prev]);
          }
        }

        const autoMessage = `I've uploaded a meeting discussion PDF: "${file.name}". Please analyze this meeting and extract all actionable next steps, follow-ups, and key decisions. Suggest specific dates and times for each action item.`;
        const userMsg: Message = {
          role: "user",
          content: autoMessage,
          timestamp: new Date().toISOString(),
          files: [uploaded],
        };
        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);
        setUploadedFiles([]);

        const aiResp = await fetch("/api/llm/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: autoMessage,
            history: [],
            agentId,
            chatId,
            files: [{ id: uploaded.id, name: uploaded.name, url: uploaded.url, extractedText: uploaded.extractedText }],
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const rawContent = aiData.message || aiData.content || aiData.response || "";
          const nextSteps = parseNextSteps(rawContent);
          const assistantMsg: Message = {
            role: "assistant",
            content: rawContent,
            timestamp: new Date().toISOString(),
            nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
          };
          const updated = [userMsg, assistantMsg];
          setMessages(updated);
          if (chatId) {
            await fetch(`/api/llm/chats/${chatId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: updated }),
            });
          }
        }
        setLoading(false);
      } else {
        const err = await response.json();
        showToast("error", `Failed to upload meeting PDF: ${err.error || "Unknown error"}`);
      }
    } catch (error) {
      showToast("error", "Failed to upload meeting PDF. Please try again.");
    } finally {
      setMeetingPdfUploading(false);
    }
  };

  // Add next step to calendar
  const handleAddToCalendar = async (step: NextStep, msgIndex: number, stepIndex: number) => {
    if (!calendarForm) return;
    setAddingToCalendar(true);
    try {
      const scheduledAt = new Date(`${step.suggested_date}T${step.suggested_time}:00`).toISOString();
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: calendarForm.name,
          phoneNumber: calendarForm.phone,
          email: calendarForm.email || undefined,
          description: `${step.title}: ${step.description}`,
          scheduledAt,
          durationMinutes: step.duration_minutes,
          reminderTiming: [],
          reminderChannels: { sms: false, email: false },
        }),
      });

      if (response.ok) {
        setCalendarSuccess(`${stepIndex}-${msgIndex}`);
        setCalendarForm(null);
        setTimeout(() => setCalendarSuccess(null), 3000);
      } else {
        const err = await response.json();
        showToast("error", `Failed to add to calendar: ${err.error || "Unknown error"}`);
      }
    } catch (error) {
      showToast("error", "Failed to add to calendar. Please try again.");
    } finally {
      setAddingToCalendar(false);
    }
  };

  // Set email reminder for a next step
  const handleSetReminder = async (step: NextStep, timing: string) => {
    try {
      const stepDate = new Date(`${step.suggested_date}T${step.suggested_time}:00`);
      let reminderDate: Date;
      switch (timing) {
        case "1day":
          reminderDate = new Date(stepDate.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "5hours":
          reminderDate = new Date(stepDate.getTime() - 5 * 60 * 60 * 1000);
          break;
        case "1hour":
          reminderDate = new Date(stepDate.getTime() - 60 * 60 * 1000);
          break;
        case "30min":
          reminderDate = new Date(stepDate.getTime() - 30 * 60 * 1000);
          break;
        default:
          reminderDate = new Date(stepDate.getTime() - 60 * 60 * 1000);
      }

      const response = await fetch("/api/scheduled-emails/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: `Reminder: ${step.title}`,
          htmlContent: buildReminderHtml(step, stepDate),
          scheduledAt: reminderDate.toISOString(),
        }),
      });

      if (response.ok) {
        setReminderSuccess(`${reminderPopover?.stepIndex}-${reminderPopover?.msgIndex}`);
        setReminderPopover(null);
        setTimeout(() => setReminderSuccess(null), 3000);
      } else {
        const err = await response.json();
        showToast("error", `Failed to set reminder: ${err.error || "Unknown error"}`);
      }
    } catch (error) {
      showToast("error", "Failed to set reminder. Please try again.");
    }
  };

  // Match assignee names from next steps to contacts in the database
  const handleSendTodos = async (msgIndex: number, steps: NextStep[]) => {
    setSendTodosPopover({ msgIndex });
    setLoadingMatches(true);
    setMatchedContacts([]);

    try {
      // Get all assignee names from the steps
      const assignees = [...new Set(steps.map((s) => s.assignee).filter((a) => a && a !== "Consultant" && a !== "Unassigned"))] as string[];

      if (assignees.length === 0) {
        showToast("error", "No client names found in the action items.");
        setSendTodosPopover(null);
        setLoadingMatches(false);
        return;
      }

      // Fetch all contacts
      const res = await fetch("/api/contacts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch contacts");
      const contacts: { id: string; name: string; email?: string; phone?: string }[] = await res.json();

      // Fuzzy match assignees to contacts
      const matches: { name: string; email: string; steps: NextStep[] }[] = [];
      for (const assignee of assignees) {
        const lower = assignee.toLowerCase();
        const contact = contacts.find((c) =>
          c.name.toLowerCase() === lower ||
          c.name.toLowerCase().includes(lower) ||
          lower.includes(c.name.toLowerCase())
        );
        if (contact?.email) {
          const contactSteps = steps.filter((s) => s.assignee?.toLowerCase() === lower);
          matches.push({ name: contact.name, email: contact.email, steps: contactSteps });
        }
      }

      setMatchedContacts(matches);
      if (matches.length === 0) {
        showToast("error", "No matching clients with email addresses found.");
        setSendTodosPopover(null);
      }
    } catch (err) {
      showToast("error", "Failed to match contacts.");
      setSendTodosPopover(null);
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleConfirmSendTodos = async (contactName: string, email: string, steps: NextStep[]) => {
    setSendingTodos((prev) => new Set(prev).add(email));
    try {
      const todoListHtml = steps
        .map((s) => `<li style="margin-bottom: 12px;">
          <strong>${s.title}</strong> <span style="color: ${s.priority === "high" ? "#dc2626" : s.priority === "medium" ? "#d97706" : "#16a34a"};">[${s.priority}]</span>
          <br/><span style="color: #555;">${s.description}</span>
          <br/><span style="color: #888; font-size: 12px;">Due: ${s.suggested_date} at ${s.suggested_time} · ${s.duration_minutes} min</span>
        </li>`)
        .join("");

      const res = await fetch("/api/scheduled-emails/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to_email: email,
          subject: `Your Action Items from Meeting`,
          htmlContent: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Your Meeting Action Items</h2>
            <p style="color: #555;">Hi ${contactName},</p>
            <p style="color: #555;">Here are your action items from the recent meeting:</p>
            <ol style="color: #333; line-height: 1.8;">${todoListHtml}</ol>
            <p style="color: #555;">Please reach out if you have any questions.</p>
            <p style="color: #888; font-size: 12px; margin-top: 24px;">— Drift Meeting Planner</p>
          </div>`,
          scheduledAt: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        setSentTodos((prev) => new Set(prev).add(email));
        showToast("success", `To-dos sent to ${contactName} (${email})`);
      } else {
        showToast("error", `Failed to send to ${contactName}`);
      }
    } catch {
      showToast("error", `Failed to send to ${contactName}`);
    } finally {
      setSendingTodos((prev) => { const next = new Set(prev); next.delete(email); return next; });
    }
  };

  const priorityColors: Record<string, string> = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-green-50 text-green-700 border-green-200",
  };

  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#f5f5f7]" style={{ background: '#f5f5f7' }}>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] max-w-sm w-full animate-in slide-in-from-right pointer-events-auto rounded-2xl shadow-lg border p-4 flex items-start gap-3 ${
          toast.type === "error" ? "bg-red-500/95 border-red-400 text-white" : "bg-green-500/95 border-green-400 text-white"
        }`}>
          {toast.type === "error" ? (
            <X className="h-5 w-5 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
          )}
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="flex-shrink-0 hover:bg-white/20 rounded p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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

      {/* Chat Sidebar - Apple Glass Style */}
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
                ? "text-black"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {sidebarTab === "chats" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black rounded-t-full"></span>
            )}
            Chats
          </button>
          <button
            onClick={() => setSidebarTab("guidelines")}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative ${
              sidebarTab === "guidelines"
                ? "text-black"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {sidebarTab === "guidelines" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black rounded-t-full"></span>
            )}
            Guidelines
          </button>
        </div>

        {/* Header - Polished */}
        <div className="p-4 border-b border-gray-200/40 bg-white/50 backdrop-blur-sm flex items-center gap-2">
          <button
            onClick={() => router.push("/agent")}
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-sm placeholder:text-gray-400 shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all"
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
              theme="light"
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
                  {editingChatId === chat.id ? (
                    <input
                      type="text"
                      value={editingChatTitle}
                      onChange={(e) => setEditingChatTitle(e.target.value)}
                      onBlur={saveEditingChat}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEditingChat(); if (e.key === "Escape") setEditingChatId(null); }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className={`flex-1 text-sm font-medium bg-transparent border-b outline-none ${
                        currentChatId === chat.id ? "text-white border-white/40" : "text-gray-900 border-gray-400"
                      }`}
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => startEditingChat(chat.id, chat.title, e)}
                      className={`flex-1 truncate text-sm font-medium ${currentChatId === chat.id ? "text-white" : "text-gray-900"}`}
                      title="Double-click to rename"
                    >
                      {chat.title}
                    </span>
                  )}
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
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 bg-white text-gray-900 text-sm font-medium shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all cursor-pointer"
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
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 bg-white text-gray-900 text-sm font-medium shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all placeholder:text-gray-400"
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
                      <div className="p-4 bg-gray-100 rounded-2xl">
                        <FileText className="h-10 w-10 text-black" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-semibold text-gray-900">PDF Template Uploaded</p>
                        <a
                          href={currentGuideline.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-black hover:text-gray-700 hover:underline font-medium transition-colors"
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
                    className="w-full h-full min-h-[320px] px-4 py-3 rounded-2xl border border-gray-300 bg-white text-gray-900 text-sm leading-relaxed shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all resize-none placeholder:text-gray-400"
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
                  className="w-full min-h-[120px] px-4 py-3 rounded-2xl border border-gray-300 bg-white text-gray-900 text-sm leading-relaxed shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all resize-none placeholder:text-gray-400"
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

              {/* Save Button */}
              <div className="pt-2">
                <div className="relative">
                  <button
                    onClick={saveGuideline}
                    disabled={savingGuideline || (!currentGuideline?.template?.trim() && !currentGuideline?.pdfUrl) || uploadingPDF}
                    className="w-full px-5 py-3 rounded-2xl bg-black text-white font-semibold text-sm shadow-md hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            <div className="text-center max-w-lg px-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-lg">
                <CalendarClock className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-3xl font-semibold text-gray-900 mb-2">Meeting Planner</h2>
              <p className="text-gray-600 mb-8 text-sm">Upload a meeting discussion PDF or start a conversation to extract action items, schedule follow-ups, and set reminders.</p>

              {/* Meeting PDF Upload Zone */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-2xl p-8 mb-6 hover:border-gray-500 hover:bg-gray-50/30 transition-all cursor-pointer group"
                onClick={() => meetingPdfInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-gray-500", "bg-gray-50/30"); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove("border-gray-500", "bg-gray-50/30"); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-gray-500", "bg-gray-50/30");
                  const file = e.dataTransfer.files[0];
                  if (file && file.type === "application/pdf") handleMeetingPdfUpload(file);
                }}
              >
                <input
                  ref={meetingPdfInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMeetingPdfUpload(file);
                    e.target.value = "";
                  }}
                />
                {meetingPdfUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 text-black animate-spin" />
                    <p className="text-sm font-medium text-gray-600">Analyzing meeting discussion...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 bg-gray-100 rounded-2xl group-hover:bg-gray-200 transition-colors">
                      <Upload className="h-8 w-8 text-gray-500 group-hover:text-black transition-colors" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-700">Upload Meeting Discussion PDF</p>
                      <p className="text-xs text-gray-400">Drag & drop or click to browse. AI will extract next steps automatically.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-400 via-indigo-500 to-purple-500 rounded-2xl blur opacity-60 group-hover:opacity-75 transition-opacity"></div>
                <button
                  onClick={createNewChat}
                  className="relative px-6 py-3 rounded-2xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 active:scale-95 transition-all shadow-lg"
                >
                  Start a Conversation
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
                      className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-gray-900 to-gray-800 text-white"
                          : "bg-white border border-gray-200 text-gray-900 shadow-md"
                      }`}
                    >
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${message.role === "user" ? "text-white" : "text-gray-900"}`}>
                        {message.role === "assistant" ? stripNextStepsBlocks(message.content) : message.content}
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

                      {/* Next Steps Cards */}
                      {message.nextSteps && message.nextSteps.length > 0 && (
                        <div className="mt-4 space-y-3 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <CalendarClock className="h-3.5 w-3.5" />
                            Action Items ({message.nextSteps.length})
                          </div>
                          {/* Send To-Dos to Clients Button */}
                          {message.nextSteps.some((s) => s.assignee && s.assignee !== "Consultant" && s.assignee !== "Unassigned") && (
                            <div className="relative">
                              <button
                                onClick={() => handleSendTodos(index, message.nextSteps!)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800 transition-colors"
                              >
                                <Mail className="h-3 w-3" />
                                Send To-Dos to Clients
                              </button>

                              {/* Matched contacts popover */}
                              {sendTodosPopover?.msgIndex === index && (
                                <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-80">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-gray-900">Send To-Dos</h4>
                                    <button onClick={() => setSendTodosPopover(null)} className="p-0.5 hover:bg-gray-100 rounded">
                                      <X className="h-3.5 w-3.5 text-gray-400" />
                                    </button>
                                  </div>
                                  {loadingMatches ? (
                                    <div className="flex items-center gap-2 py-3 text-xs text-gray-500">
                                      <Loader2 className="h-3 w-3 animate-spin" /> Matching clients...
                                    </div>
                                  ) : matchedContacts.length === 0 ? (
                                    <p className="text-xs text-gray-500 py-2">No matching clients with email addresses found.</p>
                                  ) : (
                                    <div className="space-y-3">
                                      {matchedContacts.map((mc) => (
                                        <div key={mc.email} className="p-2.5 rounded-lg border border-gray-200 bg-gray-50">
                                          <div className="flex items-center justify-between mb-1.5">
                                            <div>
                                              <div className="text-xs font-semibold text-gray-900">{mc.name}</div>
                                              <div className="text-[10px] text-gray-500">{mc.email}</div>
                                            </div>
                                            {sentTodos.has(mc.email) ? (
                                              <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                                                <CheckCircle2 className="h-3 w-3" /> Sent
                                              </span>
                                            ) : (
                                              <button
                                                onClick={() => handleConfirmSendTodos(mc.name, mc.email, mc.steps)}
                                                disabled={sendingTodos.has(mc.email)}
                                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition"
                                              >
                                                {sendingTodos.has(mc.email) ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Mail className="h-2.5 w-2.5" />}
                                                Send
                                              </button>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-gray-500">
                                            {mc.steps.length} action item{mc.steps.length !== 1 ? "s" : ""}: {mc.steps.map((s) => s.title).join(", ")}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {message.nextSteps.map((step, si) => (
                            <div key={si} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-gray-900">{step.title}</h4>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${priorityColors[step.priority] || priorityColors.medium}`}>
                                      {step.priority}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1">{step.description}</p>
                                  {step.assignee && step.assignee !== "Unassigned" && (
                                    <span className="text-[10px] text-gray-400 mt-0.5 block">Assigned to: {step.assignee}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <CalendarPlus className="h-3 w-3" />
                                  {step.suggested_date} at {step.suggested_time}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {step.duration_minutes}min
                                </span>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                {calendarSuccess === `${si}-${index}` ? (
                                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Added to calendar
                                  </span>
                                ) : calendarForm?.stepIndex === si && calendarForm?.msgIndex === index ? (
                                  <div className="flex-1 space-y-2 p-2 bg-white rounded-lg border border-gray-200">
                                    <div className="grid grid-cols-3 gap-1.5">
                                      <input
                                        type="text"
                                        placeholder="Client name *"
                                        value={calendarForm.name}
                                        onChange={(e) => setCalendarForm(prev => prev ? { ...prev, name: e.target.value } : null)}
                                        className="col-span-1 px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                      />
                                      <input
                                        type="tel"
                                        placeholder="Phone * (+1...)"
                                        value={calendarForm.phone}
                                        onChange={(e) => setCalendarForm(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                        className="col-span-1 px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                      />
                                      <input
                                        type="email"
                                        placeholder="Email"
                                        value={calendarForm.email}
                                        onChange={(e) => setCalendarForm(prev => prev ? { ...prev, email: e.target.value } : null)}
                                        className="col-span-1 px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                      />
                                    </div>
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => handleAddToCalendar(step, index, si)}
                                        disabled={addingToCalendar || !calendarForm.name || !calendarForm.phone}
                                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
                                      >
                                        {addingToCalendar ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />}
                                        Confirm
                                      </button>
                                      <button
                                        onClick={() => setCalendarForm(null)}
                                        className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setCalendarForm({ stepIndex: si, msgIndex: index, name: "", phone: "", email: "" })}
                                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 text-black bg-gray-50 hover:bg-gray-100 transition-colors"
                                  >
                                    <CalendarPlus className="h-3 w-3" />
                                    Add to Calendar
                                  </button>
                                )}

                                {reminderSuccess === `${si}-${index}` ? (
                                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Reminder set
                                  </span>
                                ) : reminderPopover?.stepIndex === si && reminderPopover?.msgIndex === index ? (
                                  <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                                    {[
                                      { key: "1day", label: "1 day before" },
                                      { key: "5hours", label: "5 hrs" },
                                      { key: "1hour", label: "1 hr" },
                                      { key: "30min", label: "30 min" },
                                    ].map((opt) => (
                                      <button
                                        key={opt.key}
                                        onClick={() => handleSetReminder(step, opt.key)}
                                        className="px-2 py-1 text-[10px] font-medium rounded-md hover:bg-gray-100 hover:text-black text-gray-600 transition-colors whitespace-nowrap"
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                    <button
                                      onClick={() => setReminderPopover(null)}
                                      className="p-0.5 text-gray-400 hover:text-gray-600"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setReminderPopover({ stepIndex: si, msgIndex: index })}
                                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 text-black bg-gray-50 hover:bg-gray-100 transition-colors"
                                  >
                                    <Bell className="h-3 w-3" />
                                    Set Reminder
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
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
              {/* Uploaded files chips */}
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {uploadedFiles.map((file) => (
                    <div key={file.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 border border-gray-300 text-xs text-black">
                      <FileText className="h-3 w-3" />
                      <span className="font-medium max-w-[150px] truncate">{file.name}</span>
                      <button onClick={() => setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id))} className="p-0.5 hover:bg-gray-200 rounded">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={sendMessage} className="flex items-end gap-3">
                <div className="flex-1 rounded-2xl border border-gray-300 bg-white p-3 flex items-end gap-2 shadow-sm hover:border-gray-400 focus-within:border-gray-500 focus-within:ring-2 focus-within:ring-gray-300 transition-all">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      // Auto-resize
                      const el = e.target;
                      el.style.height = "auto";
                      el.style.height = Math.min(el.scrollHeight, 200) + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(e);
                      }
                    }}
                    placeholder="Ask about the meeting, request next steps, or follow up..."
                    rows={1}
                    className="flex-1 resize-none border-none outline-none text-gray-900 placeholder:text-gray-400 text-sm bg-transparent font-medium"
                    style={{ maxHeight: "200px", overflow: "hidden" }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      // Validate files
                      for (const file of files) {
                        if (file.size > MAX_FILE_SIZE) {
                          showToast("error", `"${file.name}" is too large. Max size is 20MB.`);
                          e.target.value = "";
                          return;
                        }
                      }
                      setUploading(true);
                      try {
                        for (const file of files) {
                          const formData = new FormData();
                          formData.append("file", file);
                          const resp = await fetch("/api/llm/upload", { method: "POST", body: formData });
                          if (resp.ok) {
                            const data = await resp.json();
                            setUploadedFiles((prev) => [...prev, {
                              id: data.id || crypto.randomUUID(),
                              name: file.name,
                              url: data.url,
                              type: file.type,
                              size: file.size,
                              extractedText: data.extractedText,
                            }]);
                          } else {
                            showToast("error", `Failed to upload "${file.name}"`);
                          }
                        }
                      } catch (err) {
                        showToast("error", "File upload failed. Please try again.");
                      } finally {
                        setUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900"
                    aria-label="Attach file"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative">
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="p-3.5 rounded-2xl bg-black text-white hover:bg-gray-800 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center"
                    aria-label="Send message"
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
          onCancel={() => setShowDeleteConfirm(null)}
          onConfirm={confirmDeleteChat}
          title="Delete Chat"
          message={`Are you sure you want to delete "${showDeleteConfirm.title}"? This action cannot be undone.`}
          variant="danger"
        />
      )}
    </div>
  );
}


