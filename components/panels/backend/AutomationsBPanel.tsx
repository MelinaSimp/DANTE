"use client";

import { useState, useEffect } from "react";
import {
  Zap, Plus, Trash2, CheckCircle2, Loader2,
  Phone, Mail, ArrowRight, Globe, Send,
} from "lucide-react";

interface AutomationRule {
  id: string;
  trigger_event: string;
  condition: string;
  action_description: string;
  channel: string;
  active: boolean;
}

const TRIGGER_OPTIONS = [
  { value: "call.started", label: "Call Started" },
  { value: "call.completed", label: "Call Completed" },
  { value: "email.sent", label: "Email Sent" },
  { value: "contact.created", label: "Contact Created" },
  { value: "appointment.booked", label: "Appointment Booked" },
  { value: "appointment.cancelled", label: "Appointment Cancelled" },
  { value: "sale.recorded", label: "Sale Recorded" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: Phone },
  { value: "webhook", label: "Webhook", icon: Globe },
];

export default function AutomationsBPanel({ agentId }: { agentId: string }) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTrigger, setNewTrigger] = useState(TRIGGER_OPTIONS[0].value);
  const [newCondition, setNewCondition] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newChannel, setNewChannel] = useState(CHANNEL_OPTIONS[0].value);
  const [creating, setCreating] = useState(false);
  const [testChannel, setTestChannel] = useState(CHANNEL_OPTIONS[0].value);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/automation-rules`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => setRules(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingRules(false));
  }, [agentId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreateRule = async () => {
    if (!newAction.trim()) {
      setToast({ type: "error", message: "Action description is required" });
      return;
    }
    setCreating(true);
    try {
      const r = await fetch(`/api/agents/${agentId}/automation-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          trigger_event: newTrigger,
          condition: newCondition.trim(),
          action_description: newAction.trim(),
          channel: newChannel,
        }),
      });
      if (r.ok) {
        const rule = await r.json();
        setRules(prev => [rule, ...prev]);
        setShowCreate(false);
        setNewCondition("");
        setNewAction("");
        setToast({ type: "success", message: "Rule created" });
      } else {
        const d = await r.json();
        setToast({ type: "error", message: d.error || "Failed to create rule" });
      }
    } catch {
      setToast({ type: "error", message: "Error creating rule" });
    } finally {
      setCreating(false);
    }
  };

  const toggleRule = async (id: string) => {
    const rule = rules.find(r => r.id === id);
    if (!rule) return;
    const newActive = !rule.active;
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: newActive } : r));
    try {
      await fetch(`/api/agents/${agentId}/automation-rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, active: newActive }),
      });
    } catch {}
  };

  const deleteRule = async (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    try {
      await fetch(`/api/agents/${agentId}/automation-rules?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setToast({ type: "success", message: "Rule deleted" });
    } catch {
      setToast({ type: "error", message: "Failed to delete rule" });
    }
  };

  const handleTestMessage = async () => {
    if (!testRecipient.trim() || !testMessage.trim()) {
      setToast({ type: "error", message: "Recipient and message are required" });
      return;
    }
    setSending(true);
    try {
      const r = await fetch("/api/automations/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channel: testChannel, recipient: testRecipient.trim(), message: testMessage.trim() }),
      });
      if (r.ok) {
        setToast({ type: "success", message: `Message sent via ${testChannel}` });
        setTestMessage("");
      } else {
        const d = await r.json();
        setToast({ type: "error", message: d.error || "Failed to send" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to send test message" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
          toast.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>{toast.message}</div>
      )}

      {/* Status */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-green-500/10 border border-green-500/20 text-green-400">
        <CheckCircle2 className="h-4 w-4" />
        Automations engine active — {rules.filter(r => r.active).length} rule{rules.filter(r => r.active).length !== 1 ? "s" : ""} enabled
      </div>

      {/* Automation Rules */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400" />
            Automation Rules
          </h3>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-medium hover:bg-white/10 transition flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> New Rule
          </button>
        </div>

        {showCreate && (
          <div className="mb-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1">Trigger Event</label>
                <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none">
                  {TRIGGER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1">Channel</label>
                <select value={newChannel} onChange={e => setNewChannel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none">
                  {CHANNEL_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1">Condition (optional — for webhook, enter the URL)</label>
              <input value={newCondition} onChange={e => setNewCondition(e.target.value)} placeholder="e.g., https://hooks.example.com/notify"
                className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1">Action Description</label>
              <input value={newAction} onChange={e => setNewAction(e.target.value)} placeholder="e.g., Send welcome message to new contact"
                className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateRule} disabled={creating} className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 transition disabled:opacity-40 flex items-center gap-1">
                {creating && <Loader2 className="h-3 w-3 animate-spin" />}Create
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl bg-white/5 text-white/50 text-xs hover:bg-white/10 transition">Cancel</button>
            </div>
          </div>
        )}

        {loadingRules ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>
        ) : rules.length === 0 ? (
          <div className="text-center py-8">
            <Zap className="h-8 w-8 text-white/10 mx-auto mb-2" />
            <p className="text-sm text-white/30">No automation rules yet</p>
            <p className="text-xs text-white/20 mt-1">Create rules to automate actions when events occur</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition ${
                rule.active ? "bg-white/[0.03] border-white/10" : "bg-white/[0.01] border-white/5 opacity-50"
              }`}>
                <button onClick={() => toggleRule(rule.id)}
                  className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                    rule.active ? "bg-green-500 justify-end" : "bg-white/10 justify-start"
                  }`}>
                  <div className="w-4 h-4 rounded-full bg-white shadow" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 font-mono border border-cyan-500/20">{rule.trigger_event}</span>
                    <ArrowRight className="h-3 w-3 text-white/20" />
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{rule.channel}</span>
                    {rule.condition && <span className="text-[10px] text-white/20 truncate max-w-[120px]">{rule.condition}</span>}
                  </div>
                  <p className="text-xs text-white/50 mt-0.5 truncate">{rule.action_description}</p>
                </div>
                <button onClick={() => deleteRule(rule.id)} className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/5" />

      {/* Channel Test */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-cyan-400" />
          Test Channel
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select value={testChannel} onChange={e => setTestChannel(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none">
              {CHANNEL_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input value={testRecipient} onChange={e => setTestRecipient(e.target.value)}
              placeholder={testChannel === "webhook" ? "Webhook URL" : testChannel === "sms" ? "Phone number" : "Email address"}
              className="px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none" />
          </div>
          <input value={testMessage} onChange={e => setTestMessage(e.target.value)} placeholder="Test message..."
            className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none" />
          <button onClick={handleTestMessage} disabled={sending}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-white text-xs font-medium hover:bg-cyan-600 transition disabled:opacity-40 flex items-center gap-1.5">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send Test
          </button>
        </div>
      </div>
    </div>
  );
}
