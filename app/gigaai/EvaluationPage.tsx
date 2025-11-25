"use client";

import { useState, useEffect } from "react";
import { Phone, Play, Pause, Smile, ArrowRight, List } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { supabase } from "@/lib/supabase/client";

interface CallSession {
  id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  status: string;
  transcript: any[];
  conversation_state: any;
  created_at: string;
  updated_at: string;
}

interface Call {
  id: string;
  ticketId: string;
  date: string;
  duration: string;
  sentiment: "happy" | "neutral" | "sad";
  transferred: boolean;
  transcript: Message[];
}

interface Message {
  speaker: "ai" | "user";
  text: string;
  timestamp: string;
}

interface EvaluationPageProps {
  agentId: string;
}

export default function EvaluationPage({ agentId }: EvaluationPageProps) {
  const { colors } = useTheme();
  const [callSessions, setCallSessions] = useState<CallSession[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"transcript" | "details" | "logs">("transcript");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(19);

  useEffect(() => {
    async function loadCallSessions() {
      if (!agentId) {
        setLoading(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.workspace_id) {
          const { data: callSessions } = await supabase
            .from("call_sessions")
            .select("*")
            .eq("workspace_id", profile.workspace_id)
            .eq("agent_id", agentId)
            .order("created_at", { ascending: false });

          if (callSessions) {
            setCallSessions(callSessions);
            const convertedCalls: Call[] = callSessions.map((session) => {
              const transcript = Array.isArray(session.transcript) 
                ? session.transcript.map((msg: any, idx: number) => ({
                    speaker: msg.speaker || (idx % 2 === 0 ? "ai" : "user"),
                    text: msg.text || msg.message || "",
                    timestamp: msg.timestamp || `${idx * 2}s`,
                  }))
                : [];

              return {
                id: session.id,
                ticketId: session.call_sid?.substring(0, 8) || `CALL-${session.id.substring(0, 6)}`,
                date: new Date(session.created_at).toLocaleDateString(),
                duration: "2:07",
                sentiment: "happy" as const,
                transferred: false,
                transcript,
              };
            });
            
            setCalls(convertedCalls);
            if (convertedCalls.length > 0 && !selectedCall) {
              setSelectedCall(convertedCalls[0]);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load call sessions:", error);
      } finally {
        setLoading(false);
      }
    }
    loadCallSessions();
  }, [agentId, selectedCall]);


  const totalDuration = selectedCall ? 127 : 0;
  const remainingTime = totalDuration - currentTime;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.abs(seconds) % 60;
    return `${seconds < 0 ? "-" : ""}${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={`h-full flex flex-col ${colors.bg}`} style={{ backgroundImage: 'url(/backgrounds/ocean.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      <div className="flex-1 flex overflow-hidden">
        {/* Calls List */}
        <div className={`w-80 border-r ${colors.border} overflow-y-auto bg-[#242423]/50 backdrop-blur-sm`}>
          <div className="p-6 space-y-3">
            <div className="mb-6">
              <h2 className={`text-base font-semibold ${colors.text} mb-2`}>Calls</h2>
              <p className={`text-xs ${colors.textTertiary}`}>Select a call to view details</p>
            </div>
            {loading ? (
              <div className={`text-center ${colors.textTertiary} text-sm py-8`}>Loading calls...</div>
            ) : calls.length === 0 ? (
              <div className={`text-center ${colors.textTertiary} text-sm py-8`}>No calls yet</div>
            ) : (
              calls.map((call) => (
              <button
                key={call.id}
                onClick={() => {
                  setSelectedCall(call);
                  setCurrentTime(19);
                  setIsPlaying(false);
                }}
                className={`w-full text-left p-4 rounded-lg border transition ${
                  selectedCall?.id === call.id
                    ? `border-[#3351ff] bg-[#3351ff]/20`
                    : `${colors.border} ${colors.cardBg} hover:${colors.hover}`
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Phone className={`h-4 w-4 ${colors.iconSecondary}`} />
                    <span className={`text-sm font-medium ${colors.text}`}>{call.ticketId}</span>
                  </div>
                </div>
                <div className={`text-xs ${colors.textTertiary} mb-1`}>{call.date}</div>
                <div className={`text-xs ${colors.textTertiary}`}>Duration: {call.duration}</div>
              </button>
            ))
            )}
          </div>
        </div>

        {/* Call Details */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#242423]/50 backdrop-blur-sm">
          {selectedCall ? (
            <>
              {/* Header */}
              <div className={`border-b ${colors.border} px-6 py-4 bg-[#242423]/80`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xl font-semibold ${colors.text}`}>Voice call details</h2>
                  <div className="flex items-center gap-3">
                    {selectedCall.sentiment === "happy" && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30">
                        <Smile className="h-4 w-4 text-green-400" />
                        <span className="text-sm text-green-300">Happy</span>
                      </div>
                    )}
                    {selectedCall.transferred && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/30">
                        <div className="h-2 w-2 rounded-full bg-orange-400" />
                        <span className="text-sm text-orange-300">Transferred</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Call Metadata */}
                <div className={`space-y-1 text-sm ${colors.textSecondary}`}>
                  <div>Ticket ID: {selectedCall.ticketId}</div>
                  <div>
                    {selectedCall.date} ({selectedCall.duration})
                  </div>
                </div>
              </div>

              {/* Audio Player */}
              <div className={`border-b ${colors.border} px-6 py-4`}>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 hover:bg-white/5 rounded-lg transition"
                  >
                    {isPlaying ? (
                      <Pause className={`h-5 w-5 ${colors.textSecondary}`} />
                    ) : (
                      <Play className={`h-5 w-5 ${colors.textSecondary}`} />
                    )}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-sm ${colors.textSecondary} font-mono`}>
                        {formatTime(currentTime)}
                      </span>
                      <div className={`flex-1 h-1.5 ${colors.bgTertiary} rounded-full overflow-hidden`}>
                        <div
                          className={`h-full ${colors.buttonPrimary} transition-all`}
                          style={{ width: `${(currentTime / totalDuration) * 100}%` }}
                        />
                      </div>
                      <span className={`text-sm ${colors.textSecondary} font-mono`}>
                        {formatTime(-remainingTime)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className={`border-b ${colors.border} px-6`}>
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setActiveTab("transcript")}
                    className={`py-3 border-b-2 transition ${
                      activeTab === "transcript"
                        ? `border-[#3351ff] ${colors.text}`
                        : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
                    }`}
                  >
                    Transcript
                  </button>
                  <button
                    onClick={() => setActiveTab("details")}
                    className={`py-3 border-b-2 transition ${
                      activeTab === "details"
                        ? `border-[#3351ff] ${colors.text}`
                        : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
                    }`}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setActiveTab("logs")}
                    className={`py-3 border-b-2 transition ${
                      activeTab === "logs"
                        ? `border-[#3351ff] ${colors.text}`
                        : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
                    }`}
                  >
                    Logs
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {activeTab === "transcript" && (
                  <div className="space-y-4">
                    {selectedCall.transcript.map((message, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-lg border ${
                          message.speaker === "ai"
                            ? `${colors.bgTertiary} ${colors.text}`
                            : `${colors.buttonPrimary}/20 ${colors.text}`
                        }`}
                      >
                        <div className={`text-sm ${colors.text} mb-1`}>{message.text}</div>
                        <div className={`text-xs ${colors.textTertiary}`}>{message.timestamp}</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "details" && (
                  <div className={colors.textTertiary}>
                    <p>Call details will be displayed here.</p>
                  </div>
                )}

                {activeTab === "logs" && (
                  <div className={colors.textTertiary}>
                    <p>Call logs will be displayed here.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Phone className={`h-12 w-12 ${colors.iconSecondary} mx-auto mb-4`} />
                <p className={colors.textTertiary}>Select a call to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
