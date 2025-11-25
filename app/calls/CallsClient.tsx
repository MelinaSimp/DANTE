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
        return "bg-green-100 text-green-700";
      case "busy":
        return "bg-red-100 text-red-700";
      case "no-answer":
        return "bg-yellow-100 text-yellow-700";
      case "failed":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-blue-100 text-blue-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters and Stats */}
      <div className="flex items-center justify-between">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            All Calls
          </button>
          <button
            onClick={() => setFilter("incoming")}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              filter === "incoming"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Incoming
          </button>
          <button
            onClick={() => setFilter("outgoing")}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              filter === "outgoing"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Outgoing
          </button>
        </div>

        <div className="text-sm text-gray-600">
          {filteredCalls.length} call{filteredCalls.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Call Logs Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredCalls.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Image
              src="/icons/phone.png"
              alt="Phone"
              width={64}
              height={64}
              className="mx-auto mb-4 opacity-60"
            />
            <p className="text-lg font-medium mb-2">No calls yet</p>
            <p className="text-sm">Calls will appear here once you start receiving them.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Caller
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-700">
                            {call.contacts?.name ? call.contacts.name.charAt(0).toUpperCase() : '?'}
                          </span>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {call.contacts?.name || 'Unknown Caller'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {call.from_number === call.to_number ? 'Outgoing' : 'Incoming'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {call.from_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {dayjs(call.created_at).format("MMM D, h:mm A")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                        variant="outline"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Call Details</h3>
                <Button
                  variant="outline"
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
                  <label className="text-sm font-medium text-gray-500">Caller</label>
                  <p className="text-sm text-gray-900">
                    {selectedCall.contacts?.name || 'Unknown Caller'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Phone Number</label>
                  <p className="text-sm text-gray-900">{selectedCall.from_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Call Time</label>
                  <p className="text-sm text-gray-900">
                    {dayjs(selectedCall.created_at).format("MMM D, YYYY h:mm A")}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Duration</label>
                  <p className="text-sm text-gray-900">{formatDuration(selectedCall.duration)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(selectedCall.status)}`}>
                    {selectedCall.status}
                  </span>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Call SID</label>
                  <p className="text-sm text-gray-900 font-mono">{selectedCall.call_sid}</p>
                </div>
              </div>

              {selectedCall.transcription && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Transcription</label>
                  <div className="mt-1 p-3 bg-gray-50 rounded-md">
                    <p className="text-sm text-gray-900">{selectedCall.transcription}</p>
                  </div>
                </div>
              )}

              {selectedCall.recording_url && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Recording</label>
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
