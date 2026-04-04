"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { FileText, Phone, Plus, Trash2, Loader2, Play, PhoneCall, Square, ChevronDown, ChevronUp } from "lucide-react";

interface CallLogEntry {
  id: string;
  phoneNumber: string;
  status: "completed" | "no-answer" | "voicemail" | "in-progress";
  duration: number;
  date: string;
  summary: string;
  recordingUrl?: string | null;
  transcript?: Array<{ role: string; content: string }>;
}

const STATUS_LABELS: Record<CallLogEntry["status"], string> = { completed: "Completed", "no-answer": "No Answer", voicemail: "Voicemail", "in-progress": "In Progress" };
const STATUS_COLORS: Record<CallLogEntry["status"], string> = { completed: "bg-green-100 text-green-700", "no-answer": "bg-red-100 text-red-700", voicemail: "bg-yellow-100 text-yellow-700", "in-progress": "bg-blue-100 text-blue-700" };

function sk(agentId: string, key: string) { return `drift-sales-${agentId}-${key}`; }

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
  const stopRef = useRef(false);

  useEffect(() => {
    if (!agentId) return;
    try {
      const s = localStorage.getItem(sk(agentId, "script")); if (s) setSalesScript(s);
      const n = localStorage.getItem(sk(agentId, "numbers")); if (n) setPhoneNumbers(JSON.parse(n));
      const l = localStorage.getItem(sk(agentId, "callLog")); if (l) setCallLog(JSON.parse(l));
    } catch {}
  }, [agentId]);

  const persistNumbers = useCallback((nums: string[]) => { setPhoneNumbers(nums); localStorage.setItem(sk(agentId, "numbers"), JSON.stringify(nums)); }, [agentId]);
  const persistCallLog = useCallback((log: CallLogEntry[]) => { setCallLog(log); localStorage.setItem(sk(agentId, "callLog"), JSON.stringify(log)); }, [agentId]);

  useEffect(() => {
    if (!agentId || !salesScript) return;
    const t = setTimeout(() => localStorage.setItem(sk(agentId, "script"), salesScript), 400);
    return () => clearTimeout(t);
  }, [agentId, salesScript]);

  const handleSaveScript = () => { localStorage.setItem(sk(agentId, "script"), salesScript); setEditingScript(false); };
  const handleAddNumber = () => { const t = newNumber.trim(); if (!t || phoneNumbers.includes(t)) return; persistNumbers([...phoneNumbers, t]); setNewNumber(""); };
  const handleRemoveNumber = (n: string) => persistNumbers(phoneNumbers.filter(x => x !== n));

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
    const log = [...callLog];
    for (let i = 0; i < phoneNumbers.length; i++) {
      if (stopRef.current) break;
      setCurrentCallIndex(i);
      const entry: CallLogEntry = { id: crypto.randomUUID(), phoneNumber: phoneNumbers[i], status: "in-progress", duration: 0, date: new Date().toISOString(), summary: "" };
      log.unshift(entry); persistCallLog([...log]);
      try {
        const res = await fetch(`/api/agents/${agentId}/call`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ phoneNumber: phoneNumbers[i], salesScript }) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); entry.status = "no-answer"; entry.summary = e.error || "Failed"; persistCallLog([...log]); continue; }
        const { callId } = await res.json(); setCurrentCallId(callId);
        const result = await pollCallStatus(callId);
        entry.status = mapStatus(result.status, result.endedReason);
        entry.duration = result.duration || 0; entry.summary = result.summary || ""; entry.recordingUrl = result.recordingUrl; entry.transcript = result.transcript;
        persistCallLog([...log]);
      } catch (err: any) { entry.status = "no-answer"; entry.summary = err.message || "Error"; persistCallLog([...log]); }
      setCurrentCallId(null);
    }
    setCalling(false); setCurrentCallIndex(-1);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        {/* Script */}
        <div className="lg:w-[60%] bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" />Sales Script</h2>
            {!editingScript && salesScript && <button onClick={() => setEditingScript(true)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>}
          </div>
          <textarea value={salesScript} onChange={e => { setSalesScript(e.target.value); if (!editingScript) setEditingScript(true); }}
            placeholder="Write your sales pitch here..." rows={12}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 resize-none" />
          {editingScript && (
            <div className="mt-3 flex gap-2">
              <button onClick={handleSaveScript} className="px-4 py-2 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800">Save</button>
              <button onClick={() => { setSalesScript(localStorage.getItem(sk(agentId, "script")) || ""); setEditingScript(false); }}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button>
            </div>
          )}
        </div>
        {/* Numbers */}
        <div className="lg:w-[40%] bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3"><Phone className="w-4 h-4 text-gray-400" />Phone Numbers</h2>
          <div className="flex gap-2 mb-3">
            <input type="tel" value={newNumber} onChange={e => setNewNumber(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddNumber()}
              placeholder="+1 (555) 000-0000" className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5" />
            <button onClick={handleAddNumber} disabled={!newNumber.trim()} className="px-3 py-2 rounded-xl bg-black text-white hover:bg-gray-800 disabled:opacity-40"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 max-h-48">
            {phoneNumbers.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No numbers added</p>}
            {phoneNumbers.map(n => (
              <div key={n} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 group">
                <span className="text-sm text-gray-700 font-medium">{n}</span>
                <button onClick={() => handleRemoveNumber(n)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          {calling && currentCallIndex >= 0 && (
            <div className="mt-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /><span>Calling {currentCallIndex + 1}/{phoneNumbers.length}: <strong>{phoneNumbers[currentCallIndex]}</strong></span>
            </div>
          )}
          {callError && <div className="mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600">{callError}</div>}
          {calling ? (
            <button onClick={() => { stopRef.current = true; }} className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700"><Square className="w-4 h-4" />Stop</button>
          ) : (
            <button onClick={handleStartCalling} disabled={phoneNumbers.length === 0} className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-40"><Play className="w-4 h-4" />Start Calling</button>
          )}
        </div>
      </div>
      {/* Call Log */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><PhoneCall className="w-4 h-4 text-gray-400" />Call Log</h2>
          {callLog.length > 0 && <button onClick={() => persistCallLog([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>}
        </div>
        {callLog.length === 0 ? (
          <div className="text-center py-12"><PhoneCall className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-gray-400 text-sm">No calls yet</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100"><th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Number</th><th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Status</th><th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Duration</th><th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Date</th><th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Summary</th></tr></thead>
              <tbody>
                {callLog.map(e => {
                  const exp = expandedCallId === e.id;
                  const has = (e.transcript && e.transcript.length > 0) || e.recordingUrl;
                  return (
                    <React.Fragment key={e.id}>
                      <tr className={`border-b border-gray-50 hover:bg-gray-50/50 ${has ? "cursor-pointer" : ""}`} onClick={() => has && setExpandedCallId(exp ? null : e.id)}>
                        <td className="py-2.5 px-3 font-medium text-gray-900"><div className="flex items-center gap-1">{has && (exp ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />)}{e.phoneNumber}</div></td>
                        <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_COLORS[e.status]}`}>{STATUS_LABELS[e.status]}</span></td>
                        <td className="py-2.5 px-3 text-gray-600">{fmt(e.duration)}</td>
                        <td className="py-2.5 px-3 text-gray-600">{new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate">{e.summary || "—"}</td>
                      </tr>
                      {exp && (
                        <tr className="bg-gray-50/80"><td colSpan={5} className="px-4 py-3">
                          {e.recordingUrl && <div className="mb-3"><p className="text-xs font-medium text-gray-500 mb-1">Recording</p><audio controls src={e.recordingUrl} className="w-full max-w-md h-8" /></div>}
                          {e.transcript && e.transcript.length > 0 && <div><p className="text-xs font-medium text-gray-500 mb-1">Transcript</p><div className="max-h-48 overflow-y-auto space-y-1 border rounded-xl p-2.5 bg-white">{e.transcript.map((m, i) => <div key={i} className={`flex gap-2 ${m.role === "assistant" ? "" : "justify-end"}`}><div className={`max-w-[75%] px-3 py-1.5 rounded-xl text-sm ${m.role === "assistant" ? "bg-gray-100" : "bg-black text-white"}`}>{m.content}</div></div>)}</div></div>}
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
