"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Phone,
  Plus,
  X,
  Trash2,
  Loader2,
  Play,
  PhoneCall,
  Square,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";
import { useFeatures } from "@/hooks/useFeatures";

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

const STATUS_LABELS: Record<CallLogEntry["status"], string> = {
  completed: "Completed",
  "no-answer": "No Answer",
  voicemail: "Voicemail",
  "in-progress": "In Progress",
};

const STATUS_COLORS: Record<CallLogEntry["status"], string> = {
  completed: "bg-green-100 text-green-700",
  "no-answer": "bg-red-100 text-red-700",
  voicemail: "bg-yellow-100 text-yellow-700",
  "in-progress": "bg-blue-100 text-blue-700",
};

function storageKey(agentId: string, key: string) {
  return `drift-sales-${agentId}-${key}`;
}

export default function SalesPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = (params?.agentId as string) || "";

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
  const { features, loading: featuresLoading } = useFeatures();

  useEffect(() => {
    if (!featuresLoading && features.length > 0 && !features.includes("sales")) {
      router.replace("/agent");
    }
  }, [features, featuresLoading, router]);

  useEffect(() => {
    if (!agentId) return;
    try {
      const savedScript = localStorage.getItem(storageKey(agentId, "script"));
      if (savedScript) setSalesScript(savedScript);

      const savedNumbers = localStorage.getItem(storageKey(agentId, "numbers"));
      if (savedNumbers) setPhoneNumbers(JSON.parse(savedNumbers));

      const savedLog = localStorage.getItem(storageKey(agentId, "callLog"));
      if (savedLog) setCallLog(JSON.parse(savedLog));
    } catch {
      // ignore malformed localStorage data
    }
  }, [agentId]);

  const persistNumbers = useCallback(
    (numbers: string[]) => {
      setPhoneNumbers(numbers);
      localStorage.setItem(storageKey(agentId, "numbers"), JSON.stringify(numbers));
    },
    [agentId],
  );

  useEffect(() => {
    if (!agentId || !salesScript) return;
    const timeout = setTimeout(() => {
      localStorage.setItem(storageKey(agentId, "script"), salesScript);
    }, 400);
    return () => clearTimeout(timeout);
  }, [agentId, salesScript]);

  const handleSaveScript = () => {
    localStorage.setItem(storageKey(agentId, "script"), salesScript);
    setEditingScript(false);
  };

  const handleAddNumber = () => {
    const trimmed = newNumber.trim();
    if (!trimmed) return;
    if (phoneNumbers.includes(trimmed)) return;
    persistNumbers([...phoneNumbers, trimmed]);
    setNewNumber("");
  };

  const handleRemoveNumber = (number: string) => {
    persistNumbers(phoneNumbers.filter((n) => n !== number));
  };

  const persistCallLog = useCallback((log: CallLogEntry[]) => {
    setCallLog(log);
    localStorage.setItem(storageKey(agentId, "callLog"), JSON.stringify(log));
  }, [agentId]);

  const pollCallStatus = async (callId: string): Promise<{ status: string; duration?: number; summary?: string; endedReason?: string; recordingUrl?: string | null; transcript?: Array<{ role: string; content: string }> }> => {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      if (stopRef.current) return { status: "stopped" };
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/agents/${agentId}/call?callId=${callId}`, { credentials: "include" });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status === "ended" || data.status === "failed") {
          return data;
        }
      } catch {
        continue;
      }
    }
    return { status: "no-answer" };
  };

  const mapVapiStatus = (status: string, endedReason?: string): CallLogEntry["status"] => {
    if (status === "stopped") return "no-answer";
    if (status === "failed") return "no-answer";
    if (endedReason === "voicemail") return "voicemail";
    if (endedReason === "customer-did-not-answer" || endedReason === "silence-timed-out") return "no-answer";
    if (endedReason?.startsWith("pipeline-error")) return "no-answer";
    return "completed";
  };

  const handleStartCalling = async () => {
    if (phoneNumbers.length === 0) return;
    setCalling(true);
    stopRef.current = false;
    setCallError(null);

    const runningLog: CallLogEntry[] = [...callLog];

    for (let i = 0; i < phoneNumbers.length; i++) {
      if (stopRef.current) break;
      setCurrentCallIndex(i);
      const number = phoneNumbers[i];

      const entry: CallLogEntry = {
        id: crypto.randomUUID(),
        phoneNumber: number,
        status: "in-progress",
        duration: 0,
        date: new Date().toISOString(),
        summary: "",
      };
      runningLog.unshift(entry);
      persistCallLog([...runningLog]);

      try {
        const res = await fetch(`/api/agents/${agentId}/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phoneNumber: number, salesScript }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          entry.status = "no-answer";
          entry.summary = errData.error || "Failed to initiate call";
          persistCallLog([...runningLog]);
          continue;
        }

        const { callId } = await res.json();
        setCurrentCallId(callId);

        const result = await pollCallStatus(callId);
        entry.status = mapVapiStatus(result.status, result.endedReason);
        entry.duration = result.duration || 0;
        entry.summary = result.summary || (result.endedReason ? `Call ended: ${result.endedReason}` : "");
        entry.recordingUrl = result.recordingUrl || null;
        entry.transcript = result.transcript || [];
        persistCallLog([...runningLog]);
      } catch (err: any) {
        entry.status = "no-answer";
        entry.summary = err.message || "Network error";
        persistCallLog([...runningLog]);
      }

      setCurrentCallId(null);
    }

    setCalling(false);
    setCurrentCallIndex(-1);
  };

  const handleStopCalling = () => {
    stopRef.current = true;
  };

  const handleClearLog = () => {
    persistCallLog([]);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Harvey top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
          <span className="text-[var(--ink-subtle)]">·</span>
          <Link
            href="/agent"
            className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Agent
          </Link>
          <span className="text-[var(--ink-subtle)]">·</span>
          <span className="text-sm text-[var(--ink)]">Sales</span>
        </div>
      </div>

      <div className="px-8 py-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-gray-900 mb-1">Sales</h1>
            <p className="text-gray-500 text-sm">
              Manage your sales script and outbound calls
            </p>
          </div>

          {/* Top Section — Script + Phone Numbers */}
          <div className="flex flex-col lg:flex-row gap-6 mb-8">
            {/* Sales Script Editor (60%) */}
            <div className="lg:w-[60%] bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-400" />
                  Sales Script
                </h2>
                {!editingScript && salesScript && (
                  <button
                    onClick={() => setEditingScript(true)}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>

              <textarea
                value={salesScript}
                onChange={(e) => {
                  setSalesScript(e.target.value);
                  if (!editingScript) setEditingScript(true);
                }}
                placeholder="Write your sales pitch or call script here..."
                rows={14}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 resize-none"
              />

              {editingScript && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={handleSaveScript}
                    className="px-5 py-2 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
                  >
                    Save Script
                  </button>
                  <button
                    onClick={() => {
                      const saved = localStorage.getItem(storageKey(agentId, "script")) || "";
                      setSalesScript(saved);
                      setEditingScript(false);
                    }}
                    className="px-5 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Phone Numbers (40%) */}
            <div className="lg:w-[40%] bg-white rounded-2xl border border-gray-200 p-6 flex flex-col">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <Phone className="w-5 h-5 text-gray-400" />
                Phone Numbers
              </h2>

              {/* Add number */}
              <div className="flex gap-2 mb-4">
                <input
                  type="tel"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNumber()}
                  placeholder="+1 (555) 000-0000"
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300"
                />
                <button
                  onClick={handleAddNumber}
                  disabled={!newNumber.trim()}
                  className="px-3 py-2.5 rounded-xl bg-black text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Number list */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-64">
                {phoneNumbers.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">
                    No phone numbers added yet
                  </p>
                )}
                {phoneNumbers.map((number) => (
                  <div
                    key={number}
                    className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 group"
                  >
                    <span className="text-sm text-gray-700 font-medium">{number}</span>
                    <button
                      onClick={() => handleRemoveNumber(number)}
                      className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Call Progress */}
              {calling && currentCallIndex >= 0 && (
                <div className="mt-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
                  <div className="flex items-center gap-2 text-xs text-blue-700">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Calling {currentCallIndex + 1} of {phoneNumbers.length}: <strong>{phoneNumbers[currentCallIndex]}</strong></span>
                  </div>
                </div>
              )}

              {callError && (
                <div className="mt-3 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-xs text-red-600">{callError}</p>
                </div>
              )}

              {/* Start / Stop Calling */}
              {calling ? (
                <button
                  onClick={handleStopCalling}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Stop Calling
                </button>
              ) : (
                <button
                  onClick={handleStartCalling}
                  disabled={phoneNumbers.length === 0}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Start Calling
                </button>
              )}
            </div>
          </div>

          {/* Call Log */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-gray-400" />
                Call Log
              </h2>
              {callLog.length > 0 && (
                <button onClick={handleClearLog} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                  Clear Log
                </button>
              )}
            </div>

            {callLog.length === 0 ? (
              <div className="text-center py-16">
                <PhoneCall className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No calls yet</p>
                <p className="text-gray-300 text-xs mt-1">
                  Start calling to see your call history here
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">
                        Phone Number
                      </th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">
                        Duration
                      </th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">
                        Summary
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {callLog.map((entry) => {
                      const isExpanded = expandedCallId === entry.id;
                      const hasDetails = (entry.transcript && entry.transcript.length > 0) || entry.recordingUrl;
                      return (
                        <React.Fragment key={entry.id}>
                          <tr
                            className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 ${hasDetails ? "cursor-pointer" : ""}`}
                            onClick={() => hasDetails && setExpandedCallId(isExpanded ? null : entry.id)}
                          >
                            <td className="py-3 px-4 font-medium text-gray-900">
                              <div className="flex items-center gap-1.5">
                                {hasDetails && (
                                  isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                )}
                                {entry.phoneNumber}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[entry.status]}`}>
                                {STATUS_LABELS[entry.status]}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {formatDuration(entry.duration)}
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {new Date(entry.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="py-3 px-4 text-gray-600 max-w-xs truncate">
                              {entry.summary || "—"}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-50/80">
                              <td colSpan={5} className="px-6 py-4">
                                <div className="space-y-4">
                                  {entry.recordingUrl && (
                                    <div>
                                      <p className="text-xs font-medium text-gray-500 mb-1.5">Recording</p>
                                      <audio controls src={entry.recordingUrl} className="w-full max-w-md h-8" />
                                    </div>
                                  )}
                                  {entry.transcript && entry.transcript.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-gray-500 mb-1.5">Transcript</p>
                                      <div className="max-h-60 overflow-y-auto space-y-1.5 text-sm border border-gray-200 rounded-xl p-3 bg-white">
                                        {entry.transcript.map((msg, idx) => (
                                          <div key={idx} className={`flex gap-2 ${msg.role === "assistant" ? "" : "justify-end"}`}>
                                            <div className={`max-w-[75%] px-3 py-1.5 rounded-xl text-sm ${msg.role === "assistant" ? "bg-gray-100 text-gray-800" : "bg-black text-white"}`}>
                                              {msg.content}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {!entry.recordingUrl && (!entry.transcript || entry.transcript.length === 0) && (
                                    <p className="text-sm text-gray-400">No recording or transcript available.</p>
                                  )}
                                </div>
                              </td>
                            </tr>
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
      </div>
    </div>
  );
}
