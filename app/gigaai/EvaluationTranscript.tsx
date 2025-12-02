// app/gigaai/EvaluationTranscript.tsx
// Per-customer transcript view with audio playback

"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";
import { CustomerTranscript, TranscriptMessage } from "@/app/api/evaluations/transcripts/[customerId]/route";
import { ArrowLeft, Play, Pause, Download, Search } from "lucide-react";
import { getInitials, formatRelativeTime } from "@/lib/customers";

interface EvaluationTranscriptProps {
  customerId: string;
  onBack: () => void;
}

export default function EvaluationTranscript({ customerId, onBack }: EvaluationTranscriptProps) {
  const { colors } = useTheme();
  const [transcript, setTranscript] = useState<CustomerTranscript | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadTranscript();
  }, [customerId]);

  async function loadTranscript() {
    try {
      setLoading(true);
      const response = await fetch(`/api/evaluations/transcripts/${customerId}`);
      if (!response.ok) throw new Error("Failed to load transcript");
      const data = await response.json();
      setTranscript(data);
    } catch (error) {
      console.error("Error loading transcript:", error);
    } finally {
      setLoading(false);
    }
  }

  const handlePlayAudio = (messageId: string, audioUrl?: string) => {
    if (!audioUrl) {
      console.warn("No audio URL available for this message");
      return;
    }

    if (playingAudioId === messageId) {
      // Pause
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingAudioId(null);
    } else {
      // Play
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.play();
      setPlayingAudioId(messageId);
      audio.onended = () => setPlayingAudioId(null);
      audio.onerror = () => {
        console.error("Error playing audio");
        setPlayingAudioId(null);
      };
    }
  };

  const filteredMessages = transcript?.messages.filter(msg => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return msg.text.toLowerCase().includes(query);
  }) || [];

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${colors.bg}`}>
        <div className={`text-center ${colors.textTertiary} text-sm`}>
          Loading transcript...
        </div>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className={`h-full flex items-center justify-center ${colors.bg}`}>
        <div className={`text-center ${colors.textTertiary} text-sm`}>
          Failed to load transcript
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${colors.bg}`}>
      {/* Header */}
      <div className={`border-b ${colors.border} px-6 py-4 bg-[#242423]/80`}>
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={onBack}
            className={`p-2 rounded-2xl ${colors.bgTertiary} ${colors.textSecondary} hover:${colors.hover} transition`}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${colors.bgTertiary} flex items-center justify-center ${colors.text} font-medium`}>
              {getInitials(transcript.customerName)}
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${colors.text}`}>
                {transcript.customerName || transcript.customerPhone}
              </h2>
              <p className={`text-sm ${colors.textTertiary}`}>
                {transcript.totalCalls} call{transcript.totalCalls !== 1 ? "s" : ""} • {transcript.totalMessages} message{transcript.totalMessages !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${colors.iconSecondary}`} />
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-2xl ${colors.bgTertiary} ${colors.border} border ${colors.text} placeholder:${colors.textTertiary} focus:outline-none focus:ring-2 focus:ring-[#3351ff]/50`}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {filteredMessages.map((message) => (
            <div
              key={message.id}
              className={`p-4 rounded-2xl border ${
                message.role === "customer"
                  ? `${colors.bgTertiary} ${colors.border}`
                  : message.role === "ai"
                  ? `${colors.buttonPrimary}/20 ${colors.border}`
                  : `${colors.cardBg} ${colors.border}`
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    message.role === "customer"
                      ? colors.text
                      : message.role === "ai"
                      ? colors.text
                      : colors.text
                  }`}>
                    {message.role === "customer"
                      ? "Customer"
                      : message.role === "ai"
                      ? message.agentName || "AI"
                      : message.agentName || "Agent"}
                  </span>
                  {message.type === "voice" && (
                    <span className={`text-xs px-2 py-0.5 rounded ${colors.bgTertiary} ${colors.textTertiary}`}>
                      Voice
                    </span>
                  )}
                </div>
                <span className={`text-xs ${colors.textTertiary}`}>
                  {formatRelativeTime(message.timestamp)}
                </span>
              </div>

              <p className={`text-sm ${colors.text} mb-2`}>{message.text}</p>

              {/* Audio Controls */}
              {message.type === "voice" && message.audioUrl && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => handlePlayAudio(message.id, message.audioUrl)}
                    className={`p-2 rounded-2xl ${colors.bgTertiary} ${colors.textSecondary} hover:${colors.hover} transition`}
                  >
                    {playingAudioId === message.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                  {message.audioUrl && (
                    <a
                      href={message.audioUrl}
                      download
                      className={`p-2 rounded-2xl ${colors.bgTertiary} ${colors.textSecondary} hover:${colors.hover} transition`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}

          {filteredMessages.length === 0 && (
            <div className={`text-center ${colors.textTertiary} text-sm py-8`}>
              No messages found {searchQuery && `matching "${searchQuery}"`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

