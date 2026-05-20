"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { FileText, Phone, Plus, Trash2, Loader2, Play, PhoneCall, Square, ChevronDown, ChevronUp } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface CallLogEntry {
  id: string;
  phone_number: string;
  status: "completed" | "no-answer" | "voicemail" | "in-progress";
  duration: number;
  created_at: string;
  summary: string;
  recording_url?: string | null;
  transcript?: Array<{ role: string; content: string }> | null;
}

const STATUS_LABELS: Record<string, string> = { completed: "Completed", "no-answer": "No Answer", voicemail: "Voicemail", "in-progress": "In Progress" };
const STATUS_COLORS: Record<string, string> = { completed: "bg-green-100 text-green-700", "no-answer": "bg-red-100 text-red-700", voicemail: "bg-yellow-100 text-yellow-700", "in-progress": "bg-cyan-100 text-cyan-700" };

export default function SalesPanel({ agentId }: { agentId: string }) {
  const [salesScript, setSalesScript] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [calling, setCalling] = useState(false);
  const [editingScript, setEditingScript] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [currentCallIndex, setCurrentCallIndex] = useState(-1);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!agentId) return;
    Promise.all([
      fetch(`/api/agents/${agentId}/sales-config`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null),
      fetch(`/api/agents/${agentId}/call-log`, { credentials: "include" })
        .then(r => r.ok ? r.json() : []),
    ]).then(([config, logs]) => {
      if (config) {
        setSalesScript(config.sales_script || "");
        setPhoneNumbers(config.phone_numbers || []);
      }
      setCallLog(Array.isArray(logs) ? logs : []);
    }).catch(reportError("SalesPanel: load config")).finally(() => setLoadingConfig(false));
  }, [agentId]);

  const saveConfig = useCallback(async (script: string, numbers: string[]) => {
    setSavingConfig(true);
    try {
      await fetch(`/api/agents/${agentId}/sales-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sales_script: script, phone_numbers: numbers }),
      });
    } catch {} finally { setSavingConfig(false); }
  }, [agentId]);

  const handleSaveScript = () => {
    saveConfig(salesScript, phoneNumbers);
    setEditingScript(false);
  };

  const handleAddNumber = () => {
    const t = newNumber.trim();
    if (!t || phoneNumbers.includes(t)) return;
    const updated = [...phoneNumbers, t];
    setPhoneNumbers(updated);
    setNewNumber("");
    saveConfig(salesScript, updated);
  };

  const handleRemoveNumber = (n: string) => {
    const updated = phoneNumbers.filter(x => x !== n);
    setPhoneNumbers(updated);
    saveConfig(salesScript, updated);
  };

  const pollCallStatus = async (callId: string): Promise<any> => {
    for (let i = 0; i < 120; i++) {
      if (stopRef.current) return { status: "stopped" };
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/agents/${agentId}/call?callId=${callId}`, { credentials: "include" });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status === "ended" || data.status === "failed") return data;
      } catch { continue; }
    }
    return { status: "no-answer" };
  };

  const mapStatus = (status: string, reason?: string): CallLogEntry["status"] => {
    if (status === "stopped" || status === "failed") return "no-answer";
    if (reason === "voicemail") return "voicemail";
    if (reason === "customer-did-not-answer" || reason === "silence-timed-out") return "no-answer";
    if (reason?.startsWith("pipeline-error")) return "no-answer";
    return "completed";
  };

  const handleStartCalling = async () => {
    if (phoneNumbers.length === 0) return;
    setCalling(true); stopRef.current = false; setCallError(null);

    for (let i = 0; i < phoneNumbers.length; i++) {
      if (stopRef.current) break;
      setCurrentCallIndex(i);

      const createRes = await fetch(`/api/agents/${agentId}/call-log`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ phone_number: phoneNumbers[i], status: "in-progress" }),
      });
      const entry: CallLogEntry = createRes.ok ? await createRes.json() : {
        id: crypto.randomUUID(), phone_number: phoneNumbers[i], status: "in-progress" as const,
        duration: 0, created_at: new Date().toISOString(), summary: "",
      };
      setCallLog(prev => [entry, ...prev]);

      try {
        const res = await fetch(`/api/agents/${agentId}/call`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ phoneNumber: phoneNumbers[i], salesScript }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          await updateCallLog(entry.id, { status: "no-answer", summary: e.error || "Failed" });
          continue;
        }
        const { callId } = await res.json();
        setCurrentCallId(callId);
        const result = await pollCallStatus(callId);
        const finalStatus = mapStatus(result.status, result.endedReason);
        await updateCallLog(entry.id, {
          status: finalStatus,
          duration: result.duration || 0,
          summary: result.summary || "",
          recording_url: result.recordingUrl,
          transcript: result.transcript,
          vapi_call_id: callId,
        });
      } catch (err: any) {
        await updateCallLog(entry.id, { status: "no-answer", summary: err.message || "Error" });
      }
      setCurrentCallId(null);
    }
    setCalling(false); setCurrentCallIndex(-1);
  };

  const updateCallLog = async (id: string, updates: Partial<CallLogEntry> & { vapi_call_id?: string }) => {
    setCallLog(prev => prev.map(e => e.id === id ? { ...e, ...updates } as CallLogEntry : e));
    try {
      await fetch(`/api/agents/${agentId}/call-log`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ id, ...updates }),
      });
    } catch {}
  };

  const handleClearLog = async () => {
    setCallLog([]);
    try {
      await fetch(`/api/agents/${agentId}/call-log?action=clear-all&agentId=${agentId}`, {
        method: "DELETE", credentials: "include",
      });
    } catch {}
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (loadingConfig) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-[var(--ink-subtle)]" /></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        {/* Script */}
        <div className="lg:w-[60%] bg-[var(--canvas)] rounded-2xl border border-[var(--glass-border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[var(--ink)] flex items-center gap-2"><FileText className="w-4 h-4 text-[var(--ink-subtle)]" />Sales Script</h2>
            <div className="flex items-center gap-2">
              {savingConfig && <Loader2 className="w-3 h-3 animate-spin text-[var(--ink-subtle)]" />}
              {!editingScript && salesScript && <button onClick={() => setEditingScript(true)} className="text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)]">Edit</button>}
            </div>
          </div>
          <textarea value={salesScript} onChange={e => { setSalesScript(e.target.value); if (!editingScript) setEditingScript(true); }}
            placeholder="Write your sales pitch here... This acts as instructions for the AI agent during calls." rows={12}
            className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--canvas-subtle)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-none" />
          {editingScript && (
            <div className="mt-3 flex gap-2">
              <button onClick={handleSaveScript} className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700">Save</button>
              <button onClick={() => { setEditingScript(false); }}
                className="px-4 py-2 rounded-xl bg-[var(--glass-hover)] text-[var(--ink-muted)] text-sm font-medium hover:bg-[var(--canvas-muted)]">Cancel</button>
            </div>
          )}
        </div>
        {/* Numbers */}
        <div className="lg:w-[40%] bg-[var(--canvas)] rounded-2xl border border-[var(--glass-border)] p-5 flex flex-col">
          <h2 className="text-base font-semibold text-[var(--ink)] flex items-center gap-2 mb-3"><Phone className="w-4 h-4 text-[var(--ink-subtle)]" />Phone Numbers</h2>
          <div className="flex gap-2 mb-3">
            <input type="tel" value={newNumber} onChange={e => setNewNumber(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddNumber()}
              placeholder="+1 (555) 000-0000" className="flex-1 rounded-xl border border-[var(--glass-border)] bg-[var(--canvas-subtle)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20" />
            <button onClick={handleAddNumber} disabled={!newNumber.trim()} className="px-3 py-2 rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 max-h-48">
            {phoneNumbers.length === 0 && <p className="text-sm text-[var(--ink-subtle)] text-center py-6">No numbers added</p>}
            {phoneNumbers.map(n => (
              <div key={n} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--glass-border)] group">
                <span className="text-sm text-[var(--ink-muted)] font-medium">{n}</span>
                <button onClick={() => handleRemoveNumber(n)} className="text-[var(--ink-subtle)] hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          {calling && currentCallIndex >= 0 && (
            <div className="mt-2 px-3 py-2 rounded-xl bg-cyan-50 border border-cyan-100 text-xs text-cyan-700 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /><span>Calling {currentCallIndex + 1}/{phoneNumbers.length}: <strong>{phoneNumbers[currentCallIndex]}</strong></span>
            </div>
          )}
          {callError && <div className="mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600">{callError}</div>}
          {calling ? (
            <button onClick={() => { stopRef.current = true; }} className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700"><Square className="w-4 h-4" />Stop</button>
          ) : (
            <button onClick={handleStartCalling} disabled={phoneNumbers.length === 0} className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40"><Play className="w-4 h-4" />Start Calling</button>
          )}
        </div>
      </div>
      {/* Call Log */}
      <div className="bg-[var(--canvas)] rounded-2xl border border-[var(--glass-border)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-[var(--ink)] flex items-center gap-2"><PhoneCall className="w-4 h-4 text-[var(--ink-subtle)]" />Call Log</h2>
          {callLog.length > 0 && <button onClick={handleClearLog} className="text-xs text-[var(--ink-subtle)] hover:text-red-500">Clear</button>}
        </div>
        {callLog.length === 0 ? (
          <div className="text-center py-12"><PhoneCall className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-2" /><p className="text-[var(--ink-subtle)] text-sm">No calls yet</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--glass-border)]"><th className="text-left py-2 px-3 text-[var(--ink-subtle)] font-medium text-xs">Number</th><th className="text-left py-2 px-3 text-[var(--ink-subtle)] font-medium text-xs">Status</th><th className="text-left py-2 px-3 text-[var(--ink-subtle)] font-medium text-xs">Duration</th><th className="text-left py-2 px-3 text-[var(--ink-subtle)] font-medium text-xs">Date</th><th className="text-left py-2 px-3 text-[var(--ink-subtle)] font-medium text-xs">Summary</th></tr></thead>
              <tbody>
                {callLog.map(e => {
                  const exp = expandedCallId === e.id;
                  const has = (e.transcript && e.transcript.length > 0) || e.recording_url;
                  return (
                    <React.Fragment key={e.id}>
                      <tr className={`border-b border-[var(--glass-border)] hover:bg-[var(--canvas-subtle)]/50 ${has ? "cursor-pointer" : ""}`} onClick={() => has && setExpandedCallId(exp ? null : e.id)}>
                        <td className="py-2.5 px-3 font-medium text-[var(--ink)]"><div className="flex items-center gap-1">{has && (exp ? <ChevronUp className="w-3 h-3 text-[var(--ink-subtle)]" /> : <ChevronDown className="w-3 h-3 text-[var(--ink-subtle)]" />)}{e.phone_number}</div></td>
                        <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_COLORS[e.status] || "bg-[var(--glass-hover)] text-[var(--ink-muted)]"}`}>{STATUS_LABELS[e.status] || e.status}</span></td>
                        <td className="py-2.5 px-3 text-[var(--ink-muted)]">{fmt(e.duration)}</td>
                        <td className="py-2.5 px-3 text-[var(--ink-muted)]">{new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="py-2.5 px-3 text-[var(--ink-muted)] max-w-xs truncate">{e.summary || "—"}</td>
                      </tr>
                      {exp && (
                        <tr className="bg-[var(--canvas-subtle)]/80"><td colSpan={5} className="px-4 py-3">
                          {e.recording_url && <div className="mb-3"><p className="text-xs font-medium text-[var(--ink-subtle)] mb-1">Recording</p><audio controls src={e.recording_url} className="w-full max-w-md h-8" /></div>}
                          {e.transcript && e.transcript.length > 0 && <div><p className="text-xs font-medium text-[var(--ink-subtle)] mb-1">Transcript</p><div className="max-h-48 overflow-y-auto space-y-1 border rounded-xl p-2.5 bg-[var(--canvas)]">{e.transcript.map((m, i) => <div key={i} className={`flex gap-2 ${m.role === "assistant" ? "" : "justify-end"}`}><div className={`max-w-[75%] px-3 py-1.5 rounded-xl text-sm ${m.role === "assistant" ? "bg-[var(--glass-hover)]" : "bg-cyan-600 text-white"}`}>{m.content}</div></div>)}</div></div>}
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
