// app/calls/CallsClient.tsx
"use client";

import { useState } from "react";
import dayjs from "dayjs";
import Image from "next/image";
import { Button } from "@/components/ui/button";

interface CallLog {
  id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  duration: number;
  status: string;
  recording_url?: string;
  transcription?: string;
  created_at: string;
  contacts?: {
    id: string;
    name: string;
    phone: string;
  };
}

interface CallsClientProps {
  initialCallLogs: CallLog[];
  workspaceId: string;
}

export default function CallsClient({ initialCallLogs, workspaceId }: CallsClientProps) {
  const [callLogs] = useState<CallLog[]>(initialCallLogs);
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [filter, setFilter] = useState<"all" | "incoming" | "outgoing">("all");

  const filteredCalls = callLogs.filter(call => {
    if (filter === "incoming") return call.from_number !== call.to_number;
    if (filter === "outgoing") return call.from_number === call.to_number;
    return true;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-[var(--verified-soft)] text-[var(--verified)]";
      case "busy":
        return "bg-[var(--danger-soft)] text-[var(--danger)]";
      case "no-answer":
        return "bg-[var(--flag-soft)] text-[var(--flag)]";
      case "failed":
        return "bg-[var(--danger-soft)] text-[var(--danger)]";
      default:
        return "bg-[var(--accent-soft)] text-[var(--accent)]";
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters and Stats */}
      <div className="flex items-center justify-between">
        <div className="flex bg-[var(--canvas-subtle)] rounded-[6px] p-1">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-[6px] text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-[var(--canvas)] text-[var(--ink)] border border-[var(--rule)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            All Calls
          </button>
          <button
            onClick={() => setFilter("incoming")}
            className={`px-3 py-1 rounded-[6px] text-sm font-medium transition-colors ${
              filter === "incoming"
                ? "bg-[var(--canvas)] text-[var(--ink)] border border-[var(--rule)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            Incoming
          </button>
          <button
            onClick={() => setFilter("outgoing")}
            className={`px-3 py-1 rounded-[6px] text-sm font-medium transition-colors ${
              filter === "outgoing"
                ? "bg-[var(--canvas)] text-[var(--ink)] border border-[var(--rule)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            Outgoing
          </button>
        </div>

        <div className="text-sm text-[var(--ink-muted)]">
          {filteredCalls.length} call{filteredCalls.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Call Logs Table */}
      <div className="bg-[var(--canvas)] rounded-[6px] border border-[var(--rule)] overflow-hidden">
        {filteredCalls.length === 0 ? (
          <div className="p-8 text-center text-[var(--ink-muted)]">
            <Image
              src="/icons/phone.png"
              alt="Phone"
              width={64}
              height={64}
              className="mx-auto mb-4 opacity-60"
            />
            <p className="text-lg font-medium mb-2 text-[var(--ink)]">No calls yet</p>
            <p className="text-sm">Calls will appear here once you start receiving them.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--canvas-subtle)] border-b border-[var(--rule)]">
                <tr>
                  <th className="px-6 py-3 text-left label-section text-[var(--ink-muted)]">
                    Caller
                  </th>
                  <th className="px-6 py-3 text-left label-section text-[var(--ink-muted)]">
                    Number
                  </th>
                  <th className="px-6 py-3 text-left label-section text-[var(--ink-muted)]">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left label-section text-[var(--ink-muted)]">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left label-section text-[var(--ink-muted)]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left label-section text-[var(--ink-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)]">
                {filteredCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-[var(--canvas-subtle)]">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 bg-[var(--accent-soft)] rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-[var(--accent)]">
                            {call.contacts?.name ? call.contacts.name.charAt(0).toUpperCase() : '?'}
                          </span>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-[var(--ink)]">
                            {call.contacts?.name || 'Unknown Caller'}
                          </div>
                          <div className="text-sm text-[var(--ink-muted)]">
                            {call.from_number === call.to_number ? 'Outgoing' : 'Incoming'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ink)]">
                      {call.from_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ink-muted)]">
                      {dayjs(call.created_at).format("MMM D, h:mm A")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ink)]">
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(call.status)}`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedCall(call)}
                      >
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Call Details Modal */}
      {selectedCall && (
        <div className="fixed inset-0 bg-[var(--ink)]/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--rule)]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--ink)]">Call Details</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCall(null)}
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-section text-[var(--ink-muted)]">Caller</label>
                  <p className="text-sm text-[var(--ink)]">
                    {selectedCall.contacts?.name || 'Unknown Caller'}
                  </p>
                </div>
                <div>
                  <label className="label-section text-[var(--ink-muted)]">Phone Number</label>
                  <p className="text-sm text-[var(--ink)]">{selectedCall.from_number}</p>
                </div>
                <div>
                  <label className="label-section text-[var(--ink-muted)]">Call Time</label>
                  <p className="text-sm text-[var(--ink)]">
                    {dayjs(selectedCall.created_at).format("MMM D, YYYY h:mm A")}
                  </p>
                </div>
                <div>
                  <label className="label-section text-[var(--ink-muted)]">Duration</label>
                  <p className="text-sm text-[var(--ink)]">{formatDuration(selectedCall.duration)}</p>
                </div>
                <div>
                  <label className="label-section text-[var(--ink-muted)]">Status</label>
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(selectedCall.status)}`}>
                    {selectedCall.status}
                  </span>
                </div>
                <div>
                  <label className="label-section text-[var(--ink-muted)]">Call SID</label>
                  <p className="mono text-xs text-[var(--ink-subtle)]">{selectedCall.call_sid}</p>
                </div>
              </div>

              {selectedCall.transcription && (
                <div>
                  <label className="label-section text-[var(--ink-muted)]">Transcription</label>
                  <div className="mt-1 p-3 bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[6px]">
                    <p className="text-sm text-[var(--ink)]">{selectedCall.transcription}</p>
                  </div>
                </div>
              )}

              {selectedCall.recording_url && (
                <div>
                  <label className="label-section text-[var(--ink-muted)]">Recording</label>
                  <div className="mt-1">
                    <audio controls className="w-full">
                      <source src={selectedCall.recording_url} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
