"use client";

// app/email/EmailClient.tsx
//
// Workspace-level email composer. Ported from the old
// /frontend/agent/[id]/emailing shell with two substantial changes:
//
//   1. No orb sidebar. The old page dragged along an "Agents / Calendar
//      / Client Details / Meeting Planner / Sales / Emailing / Inbox"
//      left rail that was really the `/frontend` hub navigation grafted
//      onto every sub-route. The dashboard now owns that, so we drop it
//      and rely on an inline "← Dashboard" back-link in the top bar.
//
//   2. Harvey tokens everywhere. Old page was white rounded-xl Tailwind;
//      this uses --canvas / --ink / --rule / --accent and flat 4px radii
//      to match the rest of the app. Same composer behaviour, new skin.
//
// State lives entirely on the client — recent-sent is localStorage
// keyed by agentId so switching agents doesn't bleed history. Templates
// are still a closed inline set; moving them to Supabase is a separate
// task.

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Plus,
  X,
  Send,
  Loader2,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { reportError } from "@/lib/report-error";

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

Please let me know a few times that work for you in the coming weeks.

Best regards`,
  },
  {
    id: "welcome",
    name: "Welcome New Client",
    subject: "Welcome to our practice, {client_name}",
    body: `Hi {client_name},

Welcome! We're delighted to have you on board.

To get you started, here are a few things you can expect in the coming days:
- An onboarding call to align on your goals
- A secure document portal for sharing statements
- A short intake questionnaire

If anything comes up in the meantime, reply to this email or call me directly.

Best regards`,
  },
  {
    id: "document-request",
    name: "Document Request",
    subject: "Documents needed – {client_name}",
    body: `Hi {client_name},

To move forward on the work we discussed, could you share the following documents when you have a moment?

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

export default function EmailClient({ agentId }: { agentId: string }) {
  const [composing, setComposing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(
    null
  );
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
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const toInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Hydrate recent-sent from localStorage, keyed by agent so different
  // agents don't share a history.
  useEffect(() => {
    if (!agentId) return;
    try {
      const saved = localStorage.getItem(`drift-emailing-${agentId}-sent`);
      if (saved) setSentEmails(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    try {
      localStorage.setItem(
        `drift-emailing-${agentId}-sent`,
        JSON.stringify(sentEmails)
      );
    } catch {
      /* ignore */
    }
  }, [agentId, sentEmails]);

  useEffect(() => {
    fetch("/api/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .catch(reportError("email: load contacts"));
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
      setSubject(
        selectedTemplate.subject.replace(/\{client_name\}/g, contact.name)
      );
      setBody(
        selectedTemplate.body.replace(/\{client_name\}/g, contact.name)
      );
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
          recipientEmail: toEmail || undefined,
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
        body: JSON.stringify({ to: toEmail, subject, htmlContent }),
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
    <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
      {/* Top bar — back-link + page title */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex items-center gap-3">
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
          <span className="text-sm font-medium text-[var(--ink)]">Email</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-8">
          <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)]">
            Email
          </h1>
          <p className="prose-body text-[var(--ink-muted)] mt-2">
            Pick a template or start from scratch. AI can tighten a draft
            before you send.
          </p>
        </div>

        {/* Two-pane layout: templates+recent on left (narrow),
            compose/empty-state on right. Flat 1px rules, no shadows. */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-0 border-t border-b border-[var(--rule)]">
          {/* Left: Templates + Recent */}
          <div className="border-b md:border-b-0 md:border-r border-[var(--rule)] flex flex-col">
            <div className="p-4 border-b border-[var(--rule)]">
              <button
                onClick={handleCompose}
                className="w-full inline-flex items-center justify-center gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 transition"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Compose
              </button>
            </div>

            <div className="p-4 border-b border-[var(--rule)]">
              <div className="label-section mb-3">Templates</div>
              <div className="space-y-0.5">
                {EMAIL_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`w-full text-left px-3 py-2 rounded-[4px] text-sm transition ${
                      selectedTemplate?.id === template.id
                        ? "bg-[var(--canvas-subtle)] text-[var(--ink)]"
                        : "text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Mail
                        className="w-3.5 h-3.5 text-[var(--ink-subtle)] shrink-0"
                        strokeWidth={1.5}
                      />
                      <span className="truncate">{template.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 flex-1">
              <div className="label-section mb-3">Recent</div>
              {sentEmails.length === 0 ? (
                <p className="text-xs text-[var(--ink-subtle)]">
                  No emails sent yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {sentEmails.map((email) => (
                    <div
                      key={email.id}
                      className="px-3 py-2 border border-[var(--rule)] rounded-[4px]"
                    >
                      <p className="text-xs font-medium text-[var(--ink)] truncate">
                        {email.subject}
                      </p>
                      <p className="text-[11px] text-[var(--ink-muted)] truncate">
                        To: {email.to}
                      </p>
                      <p className="text-[10px] mono text-[var(--ink-subtle)] mt-0.5">
                        {new Date(email.sentAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Composer or empty state */}
          <div className="flex flex-col min-h-[600px]">
            {composing ? (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--rule)]">
                  <h2 className="text-base font-medium text-[var(--ink)]">
                    {selectedTemplate ? selectedTemplate.name : "New Email"}
                  </h2>
                  <button
                    onClick={() => {
                      setComposing(false);
                      setSelectedTemplate(null);
                      setShowAiHelper(false);
                    }}
                    className="p-1.5 hover:bg-[var(--canvas-subtle)] rounded-[4px] transition"
                    aria-label="Close composer"
                  >
                    <X className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {/* To */}
                  <div className="relative">
                    <label className="label-section block mb-1.5">To</label>
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
                        className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition"
                      />
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                    </div>
                    {showSuggestions && filteredContacts.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        className="absolute z-20 top-full left-0 right-0 mt-1 bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] max-h-48 overflow-y-auto"
                      >
                        {filteredContacts.map((contact) => (
                          <button
                            key={contact.id}
                            onClick={() => handleSelectContact(contact)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--canvas-subtle)] transition border-b border-[var(--rule)] last:border-b-0"
                          >
                            <div className="w-7 h-7 rounded-full bg-[var(--canvas-subtle)] flex items-center justify-center shrink-0">
                              <span className="text-xs font-semibold text-[var(--ink-muted)]">
                                {contact.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--ink)] truncate">
                                {contact.name}
                              </p>
                              <p className="text-xs text-[var(--ink-muted)] truncate">
                                {contact.email}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="label-section block mb-1.5">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject..."
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="label-section block mb-1.5">Body</label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write your email..."
                      rows={14}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition resize-none font-sans leading-relaxed"
                    />
                  </div>

                  {/* AI Helper */}
                  {!showAiHelper ? (
                    <button
                      onClick={() => setShowAiHelper(true)}
                      className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--rule)] px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                    >
                      <Sparkles className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                      Ask AI to help
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div
                        className="group relative flex items-center gap-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] pl-3 pr-1.5 py-1.5 transition focus-within:border-[var(--ink)]"
                      >
                        <Sparkles
                          className="w-4 h-4 shrink-0 text-[var(--ink-muted)] group-focus-within:text-[var(--ink)] transition"
                          strokeWidth={1.5}
                        />
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
                          placeholder={
                            body.trim()
                              ? "Tell the AI how to refine this draft…"
                              : "Tell the AI what this email is about…"
                          }
                          className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
                        />
                        <button
                          onClick={handleAskAi}
                          disabled={loadingAi || !aiPrompt.trim()}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:bg-[var(--ink)]/90 disabled:opacity-30 disabled:cursor-not-allowed transition"
                          aria-label="Send prompt"
                        >
                          {loadingAi ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                          ) : (
                            <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setShowAiHelper(false);
                            setAiPrompt("");
                            setAiResponse("");
                          }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                          aria-label="Close AI helper"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                      {body.trim() && !aiResponse && !loadingAi && (
                        <div className="flex flex-wrap gap-1.5">
                          {["Make it shorter", "More professional", "More friendly", "Fix grammar"].map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                setAiPrompt(p);
                                setTimeout(() => handleAskAi(), 0);
                              }}
                              className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-[var(--rule)] hover:border-[var(--ink)] rounded-[4px] px-2 py-1 transition"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      )}
                      {aiResponse && (
                        <div className="space-y-2">
                          <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-3 py-2.5 text-sm text-[var(--ink)] leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                            {aiResponse}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleApplyAiSuggestion}
                              className="inline-flex items-center gap-1.5 rounded-[4px] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 transition"
                            >
                              <Sparkles className="w-3 h-3" strokeWidth={1.5} />
                              Apply to email body
                            </button>
                            <button
                              onClick={() => setAiResponse("")}
                              className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
                            >
                              Discard
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-[var(--rule)]">
                  <button
                    onClick={handleSend}
                    disabled={sending || !toEmail || !subject || !body}
                    className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" strokeWidth={1.5} />
                        Send Email
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-10">
                <div className="text-center max-w-sm">
                  <Mail className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-4" strokeWidth={1.5} />
                  <h2 className="heading-display text-2xl text-[var(--ink)] mb-2">
                    Pick a template, or compose
                  </h2>
                  <p className="text-sm text-[var(--ink-muted)] mb-6">
                    Select one of the templates on the left, or start a new
                    email from scratch.
                  </p>
                  <button
                    onClick={handleCompose}
                    className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 transition"
                  >
                    <Plus className="w-4 h-4" strokeWidth={1.5} />
                    New email
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-[4px] text-sm font-medium transition ${
            toast.type === "success"
              ? "bg-[var(--verified)] text-[var(--canvas)]"
              : "bg-[var(--danger)] text-[var(--canvas)]"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
