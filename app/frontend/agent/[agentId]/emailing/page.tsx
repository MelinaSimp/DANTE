"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Calendar,
  FileText,
  CalendarClock,
  Phone,
  Mail,
  Plus,
  X,
  Send,
  Loader2,
  Sparkles,
  ChevronDown,
  Inbox,
} from "lucide-react";
import { useFeatures } from "@/hooks/useFeatures";
import type { FeatureId } from "@/lib/features";

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

interface SentEmail {
  id: string;
  to: string;
  subject: string;
  sentAt: string;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "follow-up",
    name: "Follow-up After Meeting",
    subject: "Great meeting with you, {client_name}",
    body: `Hi {client_name},

Thank you for taking the time to meet with me today. I really enjoyed our conversation and wanted to follow up on a few key points we discussed.

Here's a quick summary of the next steps we agreed on:
- [Action item 1]
- [Action item 2]
- [Action item 3]

Please don't hesitate to reach out if you have any questions or need further clarification on anything.

Looking forward to our continued collaboration.

Best regards`,
  },
  {
    id: "quarterly-review",
    name: "Quarterly Review Reminder",
    subject: "Upcoming Quarterly Review – {client_name}",
    body: `Hi {client_name},

I hope this message finds you well. I wanted to reach out to schedule our upcoming quarterly review.

During this review, we'll cover:
- Performance overview for the past quarter
- Key metrics and progress toward goals
- Adjustments to our strategy going forward
- Any questions or concerns you may have

Could you let me know your availability over the next two weeks? I'd love to find a time that works best for you.

Best regards`,
  },
  {
    id: "welcome",
    name: "Welcome New Client",
    subject: "Welcome aboard, {client_name}!",
    body: `Hi {client_name},

Welcome! We're thrilled to have you on board and look forward to working together.

Here's what you can expect next:
1. An introductory call to discuss your goals and expectations
2. A tailored onboarding plan designed specifically for you
3. Access to our resources and support team

In the meantime, feel free to explore our platform and don't hesitate to reach out with any questions.

Best regards`,
  },
  {
    id: "document-request",
    name: "Document Request",
    subject: "Document Request – {client_name}",
    body: `Hi {client_name},

I hope you're doing well. In order to move forward with your account, we'll need the following documents at your earliest convenience:

- [Document 1]
- [Document 2]
- [Document 3]

You can reply to this email with the attachments, or upload them directly through our secure portal.

If you have any questions about what's needed, please don't hesitate to ask.

Thank you for your prompt attention to this matter.

Best regards`,
  },
  {
    id: "appointment-confirmation",
    name: "Appointment Confirmation",
    subject: "Appointment Confirmed – {client_name}",
    body: `Hi {client_name},

This is a confirmation of your upcoming appointment:

Date: [Date]
Time: [Time]
Location/Link: [Location or meeting link]

Please let me know if you need to reschedule or have any questions before our meeting.

Looking forward to speaking with you.

Best regards`,
  },
];

export default function EmailingPage() {
  const params = useParams();
  const pathname = usePathname();
  const agentId = params.agentId as string;

  const [composing, setComposing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const { features } = useFeatures();

  const toInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const sidebarItems = [
    {
      name: "Agents",
      icon: Bot,
      href: "/frontend",
      active:
        pathname === "/frontend" ||
        (pathname?.startsWith("/frontend/agent") &&
          !pathname.includes("/schedule") &&
          !pathname.includes("/llm") &&
          !pathname.includes("/inbox") &&
          !pathname.includes("/sales") &&
          !pathname.includes("/emailing")),
    },
    {
      name: "Calendar",
      icon: Calendar,
      href: `/frontend/agent/${agentId}/schedule`,
      active: pathname?.includes("/schedule"),
      featureId: "calendar" as FeatureId,
    },
    {
      name: "Client Details",
      icon: FileText,
      href: "/client-details-overview",
      active: pathname === "/client-details-overview",
      featureId: "client_details" as FeatureId,
    },
    {
      name: "Meeting Planner",
      icon: CalendarClock,
      href: `/frontend/agent/${agentId}/llm`,
      active: pathname?.includes("/llm"),
      featureId: "meeting_planner" as FeatureId,
    },
    {
      name: "Sales",
      icon: Phone,
      href: `/frontend/agent/${agentId}/sales`,
      active: pathname?.includes("/sales"),
      featureId: "sales" as FeatureId,
    },
    {
      name: "Emailing",
      icon: Mail,
      href: `/frontend/agent/${agentId}/emailing`,
      active: pathname?.includes("/emailing"),
      featureId: "emailing" as FeatureId,
    },
    {
      name: "Inbox",
      icon: Inbox,
      href: `/frontend/agent/${agentId}/inbox`,
      active: pathname?.includes("/inbox"),
      featureId: "inbox" as FeatureId,
    },
  ];

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");

    const originalHtmlBg = html.style.background;
    const originalBodyBg = body.style.background;
    const originalBodyColor = body.style.color;
    const originalMainBg = main ? (main as HTMLElement).style.background : null;

    html.style.setProperty("background", "#f5f5f7", "important");
    body.style.setProperty("background", "#f5f5f7", "important");
    body.style.setProperty("color", "#111827", "important");
    if (main) {
      (main as HTMLElement).style.setProperty("background", "#f5f5f7", "important");
    }

    return () => {
      html.style.setProperty("background", originalHtmlBg, "important");
      body.style.setProperty("background", originalBodyBg, "important");
      body.style.setProperty("color", originalBodyColor, "important");
      if (main && originalMainBg !== null) {
        (main as HTMLElement).style.setProperty("background", originalMainBg, "important");
      }
    };
  }, []);

  useEffect(() => {
    if (!agentId) return;
    try {
      const saved = localStorage.getItem(`drift-emailing-${agentId}-sent`);
      if (saved) setSentEmails(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    try {
      localStorage.setItem(`drift-emailing-${agentId}-sent`, JSON.stringify(sentEmails));
    } catch { /* ignore */ }
  }, [agentId, sentEmails]);

  useEffect(() => {
    fetch("/api/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        toInputRef.current &&
        !toInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredContacts = contacts.filter(
    (c) =>
      c.email &&
      (c.name.toLowerCase().includes(toEmail.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(toEmail.toLowerCase())))
  );

  const handleCompose = () => {
    setComposing(true);
    setSelectedTemplate(null);
    setToEmail("");
    setSubject("");
    setBody("");
    setAiPrompt("");
    setAiResponse("");
    setShowAiHelper(false);
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setComposing(true);
    setSubject(template.subject);
    setBody(template.body);
    setAiPrompt("");
    setAiResponse("");
    setShowAiHelper(false);
  };

  const handleSelectContact = (contact: Contact) => {
    setToEmail(contact.email || "");
    setShowSuggestions(false);
    if (selectedTemplate) {
      setSubject(selectedTemplate.subject.replace(/\{client_name\}/g, contact.name));
      setBody(selectedTemplate.body.replace(/\{client_name\}/g, contact.name));
    }
  };

  const handleAskAi = async () => {
    if (!aiPrompt.trim()) return;
    setLoadingAi(true);
    setAiResponse("");
    try {
      const response = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: `You are helping compose an email. Here is the current email body:\n\n---\n${body}\n---\n\nThe user's request: ${aiPrompt}\n\nPlease provide the improved or new email body text only, without any extra explanation.`,
          history: [],
          agentId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.message || data.content || data.response || "";
        setAiResponse(content);
      } else {
        setAiResponse("Sorry, I couldn't generate a response. Please try again.");
      }
    } catch {
      setAiResponse("Failed to reach AI. Please try again.");
    } finally {
      setLoadingAi(false);
    }
  };

  const handleApplyAiSuggestion = () => {
    if (aiResponse) {
      setBody(aiResponse);
      setAiResponse("");
      setAiPrompt("");
      setShowAiHelper(false);
    }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSend = async () => {
    if (!toEmail || !subject || !body) return;
    setSending(true);
    try {
      const htmlContent = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; white-space: pre-wrap;">${body.replace(/\n/g, "<br/>")}</div>`;

      const response = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to: toEmail,
          subject,
          htmlContent,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSentEmails((prev) => [
          {
            id: result.messageId || crypto.randomUUID(),
            to: toEmail,
            subject,
            sentAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        showToast("success", `Email sent to ${toEmail}`);
        setComposing(false);
        setSelectedTemplate(null);
        setToEmail("");
        setSubject("");
        setBody("");
        setAiPrompt("");
        setAiResponse("");
        setShowAiHelper(false);
      } else {
        showToast("error", result.error || "Failed to send email");
      }
    } catch {
      showToast("error", "Network error — could not send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex" style={{ background: "#f5f5f7" }}>
      {/* Left Sidebar */}
      <div className="hidden md:flex flex-col w-48 border-r border-gray-200 bg-white shrink-0">
        <div className="p-4 border-b border-gray-200 flex items-center gap-2">
          <Link href="/frontend" className="flex items-center gap-2">
            <img
              src="/brand/logo-circle.png"
              alt="Drift"
              className="w-7 h-7 rounded-full object-cover"
            />
            <span className="text-sm font-semibold text-gray-900">Drift</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.filter((item) => !item.featureId || features.includes(item.featureId)).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  item.active
                    ? "bg-gray-100 text-black"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Email Sidebar Panel */}
      <div className="w-64 border-r border-gray-200 bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={handleCompose}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Compose
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Templates */}
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Templates
            </h3>
            <div className="space-y-1.5">
              {EMAIL_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    selectedTemplate?.id === template.id
                      ? "bg-gray-100 text-black"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{template.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Recent Emails */}
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Recent Emails
            </h3>
            {sentEmails.length === 0 ? (
              <p className="text-xs text-gray-400">No emails sent yet.</p>
            ) : (
              <div className="space-y-1.5">
                {sentEmails.map((email) => (
                  <div
                    key={email.id}
                    className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100"
                  >
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {email.subject}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">To: {email.to}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(email.sentAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white">
        {composing ? (
          <div className="flex-1 flex flex-col">
            {/* Email Form Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedTemplate ? selectedTemplate.name : "New Email"}
              </h2>
              <button
                onClick={() => {
                  setComposing(false);
                  setSelectedTemplate(null);
                  setShowAiHelper(false);
                }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Email Form */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* To Field */}
              <div className="relative">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  To
                </label>
                <div className="relative">
                  <input
                    ref={toInputRef}
                    type="email"
                    value={toEmail}
                    onChange={(e) => {
                      setToEmail(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Type a name or email..."
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm placeholder:text-gray-400 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all"
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                {showSuggestions && filteredContacts.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg max-h-48 overflow-y-auto"
                  >
                    {filteredContacts.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => handleSelectContact(contact)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-gray-600">
                            {contact.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {contact.name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{contact.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Subject Field */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm placeholder:text-gray-400 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all"
                />
              </div>

              {/* Body Field */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your email..."
                  rows={14}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm leading-relaxed placeholder:text-gray-400 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all resize-none"
                />
              </div>

              {/* AI Helper Toggle */}
              {!showAiHelper ? (
                <button
                  onClick={() => setShowAiHelper(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-gray-500" />
                  Ask AI to help
                </button>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-semibold text-gray-900">AI Assistant</span>
                    </div>
                    <button
                      onClick={() => {
                        setShowAiHelper(false);
                        setAiPrompt("");
                        setAiResponse("");
                      }}
                      className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAskAi();
                        }
                      }}
                      placeholder='e.g., "Make it more professional", "Add a closing paragraph"'
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
                    />
                    <button
                      onClick={handleAskAi}
                      disabled={loadingAi || !aiPrompt.trim()}
                      className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                    >
                      {loadingAi ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {aiResponse && (
                    <div className="space-y-2">
                      <div className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {aiResponse}
                      </div>
                      <button
                        onClick={handleApplyAiSuggestion}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-xs font-medium hover:bg-gray-800 transition-all"
                      >
                        <Sparkles className="w-3 h-3" />
                        Apply to email body
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Send Button */}
            <div className="px-6 py-4 border-t border-gray-200 bg-white">
              <button
                onClick={handleSend}
                disabled={sending || !toEmail || !subject || !body}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
                <Mail className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Select a template or compose a new email
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Choose from the templates on the left or click Compose to start from scratch.
              </p>
              <button
                onClick={handleCompose}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Compose New Email
              </button>
            </div>
          </div>
        )}
      </div>
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
