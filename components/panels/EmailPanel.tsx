"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Loader2, Sparkles, Plus, X, ChevronDown, Mail } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface Contact { id: string; name: string; email?: string }
interface SentEmail { id: string; to_email: string; subject: string; created_at: string }
interface EmailTemplate { id: string; name: string; subject: string; body: string }

const TEMPLATES: EmailTemplate[] = [
  { id: "follow-up", name: "Follow-up", subject: "Great meeting with you, {client_name}", body: "Hi {client_name},\n\nThank you for taking the time to meet with me today. I wanted to follow up on the key points we discussed.\n\nBest regards" },
  { id: "quarterly", name: "Quarterly Review", subject: "Upcoming Review – {client_name}", body: "Hi {client_name},\n\nI wanted to reach out to schedule our upcoming quarterly review.\n\nCould you let me know your availability?\n\nBest regards" },
  { id: "welcome", name: "Welcome", subject: "Welcome aboard, {client_name}!", body: "Hi {client_name},\n\nWelcome! We're thrilled to have you on board.\n\nBest regards" },
  { id: "docs", name: "Document Request", subject: "Documents Needed – {client_name}", body: "Hi {client_name},\n\nWe'll need the following documents:\n- [Document 1]\n- [Document 2]\n\nBest regards" },
];

export default function EmailPanel({ agentId }: { agentId: string }) {
  const [composing, setComposing] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [loadingSent, setLoadingSent] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const sugRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/emails/history", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => setSentEmails(Array.isArray(d) ? d : []))
      .catch(reportError("EmailPanel: load sent"))
      .finally(() => setLoadingSent(false));
  }, []);

  useEffect(() => {
    fetch("/api/contacts", { credentials: "include" }).then(r => r.ok ? r.json() : []).then(d => setContacts(Array.isArray(d) ? d : [])).catch(reportError("EmailPanel: load contacts"));
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (sugRef.current && !sugRef.current.contains(e.target as Node) && toRef.current && !toRef.current.contains(e.target as Node)) setShowSuggestions(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = contacts.filter(c => c.email && (c.name.toLowerCase().includes(toEmail.toLowerCase()) || (c.email || "").toLowerCase().includes(toEmail.toLowerCase())));

  const handleTemplate = (t: EmailTemplate) => { setComposing(true); setSubject(t.subject); setBody(t.body); };
  const handleContact = (c: Contact) => { setToEmail(c.email || ""); setShowSuggestions(false); setSubject(s => s.replace(/\{client_name\}/g, c.name)); setBody(b => b.replace(/\{client_name\}/g, c.name)); };

  const handleAi = async () => {
    if (!aiPrompt.trim()) return;
    setLoadingAi(true);
    setAiResponse("");
    try {
      const r = await fetch("/api/ai/compose-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: aiPrompt, currentBody: body, currentSubject: subject }),
      });
      if (r.ok) {
        const d = await r.json();
        setAiResponse(d.body || "");
        if (d.subject && !subject) setSubject(d.subject);
        if (d.to && !toEmail) setToEmail(d.to);
      } else {
        const fallback = await fetch("/api/llm/chat", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ message: `Help compose email. Current body:\n${body}\n\nRequest: ${aiPrompt}\n\nProvide improved body only.`, history: [], agentId }) });
        if (fallback.ok) { const d = await fallback.json(); setAiResponse(d.message || d.content || ""); }
      }
    } catch {} finally { setLoadingAi(false); }
  };

  const handleSend = async () => {
    if (!toEmail || !subject || !body) return;
    setSending(true);
    try {
      const html = `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;white-space:pre-wrap;">${body.replace(/\n/g, "<br/>")}</div>`;
      const r = await fetch("/api/emails/send", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ to: toEmail, subject, htmlContent: html }) });
      const result = await r.json();
      if (r.ok && result.success) {
        const historyRes = await fetch("/api/emails/history", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ to: toEmail, subject, message_id: result.messageId }),
        });
        if (historyRes.ok) {
          const saved = await historyRes.json();
          setSentEmails(prev => [saved, ...prev]);
        }
        setToast({ type: "success", msg: `Sent to ${toEmail}` }); setTimeout(() => setToast(null), 3500);
        setComposing(false); setToEmail(""); setSubject(""); setBody("");
      } else { setToast({ type: "error", msg: result.error || "Failed" }); setTimeout(() => setToast(null), 3500); }
    } catch { setToast({ type: "error", msg: "Network error" }); setTimeout(() => setToast(null), 3500); }
    finally { setSending(false); }
  };

  return (
    <div className="flex h-full">
      {toast && <div className={`fixed top-20 right-8 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === "error" ? "bg-red-500 text-white" : "bg-green-500 text-white"}`}>{toast.msg}</div>}

      {/* Templates sidebar */}
      <div className="w-56 border-r border-[var(--glass-border)] bg-[var(--canvas-subtle)]/50 p-4 shrink-0 hidden md:block overflow-y-auto">
        <button onClick={() => { setComposing(true); setSubject(""); setBody(""); setToEmail(""); }} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 mb-4">
          <Plus className="w-4 h-4" />Compose
        </button>
        <p className="text-[10px] font-semibold text-[var(--ink-subtle)] uppercase tracking-wider mb-2">Templates</p>
        <div className="space-y-1">
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => handleTemplate(t)} className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--ink-muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] transition">{t.name}</button>
          ))}
        </div>
        {sentEmails.length > 0 && (
          <>
            <p className="text-[10px] font-semibold text-[var(--ink-subtle)] uppercase tracking-wider mt-6 mb-2">Recent ({sentEmails.length})</p>
            <div className="space-y-1">
              {sentEmails.slice(0, 10).map(e => (
                <div key={e.id} className="px-3 py-2 rounded-lg text-xs text-[var(--ink-subtle)]">
                  <div className="font-medium text-[var(--ink-muted)] truncate">{e.to_email}</div>
                  <div className="truncate">{e.subject}</div>
                  <div className="text-[10px] text-[var(--ink-subtle)] mt-0.5">{new Date(e.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {!composing ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Mail className="w-12 h-12 text-[var(--ink-subtle)] mx-auto mb-3" />
              <p className="text-[var(--ink-subtle)] text-sm mb-4">Select a template or compose a new email</p>
              <button onClick={() => setComposing(true)} className="px-5 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700">Compose</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 max-w-3xl mx-auto w-full">
            {/* To */}
            <div className="relative mb-3">
              <label className="text-xs font-medium text-[var(--ink-subtle)] mb-1 block">To</label>
              <input ref={toRef} type="email" value={toEmail} onChange={e => { setToEmail(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)} placeholder="email@example.com"
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--canvas-subtle)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20" />
              {showSuggestions && filtered.length > 0 && (
                <div ref={sugRef} className="absolute top-full left-0 right-0 mt-1 bg-[var(--canvas)] border border-[var(--glass-border)] rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                  {filtered.map(c => (
                    <button key={c.id} onClick={() => handleContact(c)} className="w-full text-left px-4 py-2 hover:bg-[var(--canvas-subtle)] text-sm flex justify-between">
                      <span className="font-medium text-[var(--ink)]">{c.name}</span><span className="text-[var(--ink-subtle)]">{c.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Subject */}
            <div className="mb-3">
              <label className="text-xs font-medium text-[var(--ink-subtle)] mb-1 block">Subject</label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--canvas-subtle)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20" />
            </div>
            {/* Body */}
            <div className="flex-1 mb-3">
              <label className="text-xs font-medium text-[var(--ink-subtle)] mb-1 block">Body</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your email..."
                className="w-full h-full min-h-[200px] rounded-xl border border-[var(--glass-border)] bg-[var(--canvas-subtle)] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/20" />
            </div>
            {/* AI helper */}
            {showAi && (
              <div className="mb-3 bg-[var(--canvas-subtle)] rounded-xl border border-[var(--glass-border)] p-4">
                <div className="flex gap-2 mb-2">
                  <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAi()}
                    placeholder="e.g. Write a follow-up email for John Smith..." className="flex-1 rounded-lg border border-[var(--glass-border)] px-3 py-2 text-sm focus:outline-none" />
                  <button onClick={handleAi} disabled={loadingAi} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-sm disabled:opacity-50">
                    {loadingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
                  </button>
                </div>
                {aiResponse && (
                  <div className="mt-2">
                    <pre className="text-sm text-[var(--ink-muted)] whitespace-pre-wrap bg-[var(--canvas)] rounded-lg p-3 border border-[var(--glass-border)] max-h-40 overflow-y-auto">{aiResponse}</pre>
                    <button onClick={() => { setBody(aiResponse); setAiResponse(""); setShowAi(false); }} className="mt-2 text-sm text-cyan-600 hover:underline">Apply</button>
                  </div>
                )}
              </div>
            )}
            {/* Actions */}
            <div className="flex items-center gap-3">
              <button onClick={handleSend} disabled={!toEmail || !subject || !body || sending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send
              </button>
              <button onClick={() => setShowAi(!showAi)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--glass-hover)] text-[var(--ink-muted)] text-sm font-medium hover:bg-[var(--canvas-muted)]">
                <Sparkles className="w-4 h-4" />AI Help
              </button>
              <button onClick={() => setComposing(false)} className="text-sm text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] ml-auto">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
