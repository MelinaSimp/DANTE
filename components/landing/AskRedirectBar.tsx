"use client";

import { useRouter } from "next/navigation";
import { Mic, Sparkles } from "lucide-react";

const suggestions = [
  "Summarize this morning's calls",
  "What follow-ups are overdue?",
  "Show me upcoming appointments for today",
];

export default function AskRedirectBar() {
  const router = useRouter();

  const goToAuth = () => router.push("/auth");

  return (
    <div className="mt-10 w-full max-w-[48rem] space-y-6">
      <div className="group relative flex items-center">
        <div className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-lg text-[var(--ink-subtle)]">
          +
        </div>
        <input
          type="text"
          placeholder="Ask anything"
          aria-label="Ask anything"
          readOnly
          onFocus={goToAuth}
          onClick={goToAuth}
          className="w-full cursor-pointer rounded-full border border-white/10 bg-black/60 py-4 pl-16 pr-32 text-base text-white placeholder:text-[var(--ink-subtle)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
        <div className="absolute right-3 flex items-center gap-2">
          <button
            type="button"
            onClick={goToAuth}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/50 text-[var(--ink-subtle)] transition hover:text-white"
            aria-label="Use microphone"
          >
            <Mic size={18} />
          </button>
          <button
            type="button"
            onClick={goToAuth}
            className="inline-flex items-center gap-2 rounded-full bg-[#3351ff] px-4 py-2 text-sm font-medium text-white shadow-[0_0_15px_rgba(51,81,255,0.35)] transition hover:bg-[#4b63ff]"
          >
            <Sparkles size={16} />
            Ask Drift
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--ink-subtle)] lg:justify-center">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={goToAuth}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[var(--ink-subtle)] transition hover:border-[var(--accent)]/40 hover:bg-black/30 hover:text-white"
          >
            <Sparkles size={14} className="text-blue-400" />
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}












