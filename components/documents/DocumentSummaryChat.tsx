"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import ChartRenderer from "@/components/charts/ChartRenderer";

interface DocumentSummaryChatProps {
  contactId: string;
  clientName: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  chartData?: {
    type: "line" | "bar" | "pie" | "area";
    data: unknown[];
    xKey: string;
    yKey: string;
    title?: string;
  };
}

export default function DocumentSummaryChat({ contactId, clientName }: DocumentSummaryChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-6),
          contactId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to get response");
      }

      const data = await res.json();
      const content = data.message || data.content || "";

      let chartData: Message["chartData"];
      const match = content.match(/<!--CHART_DATA-->([\s\S]*?)<!--\/CHART_DATA-->/);
      if (match) {
        try {
          const json = JSON.parse(match[1].trim());
          if (json.chart) chartData = json.chart;
        } catch {}
      }

      const cleanContent = content.replace(/<!--CHART_DATA-->[\s\S]*?<!--\/CHART_DATA-->/g, "").trim();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: cleanContent || "I couldn't generate a response.",
          chartData,
        },
      ]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 border-t border-[#e5e7eb] bg-[#f9fafb] rounded-b-xl">
      <p className="text-xs font-medium text-[#6b7280] mb-3">
        Ask the AI to generate a one-page summary with charts. The annotated PDF for {clientName} is used as a template.
      </p>
      <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-[#e5e7eb] text-[#374151]"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.chartData && (
                <div className="mt-3 h-48">
                  <ChartRenderer data={m.chartData} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3 py-2 bg-white border border-[#e5e7eb]">
              <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Generate a one-page summary with charts"
          className="flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </button>
      </form>
    </div>
  );
}
