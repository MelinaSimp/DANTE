"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Sparkles, Loader2, AlertCircle, ClipboardList, CheckCircle2, XCircle } from "lucide-react";

interface AskDriftProps {
  suggestions?: string[];
}

interface ChatResponse {
  answer: string;
  operations?: Array<{ action: string; args?: Record<string, any> }>;
  results?: Array<{ action: string; status: "ok" | "error"; data?: any; error?: string }>;
}

export default function AskDrift({ suggestions = [] }: AskDriftProps) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [displayAnswer, setDisplayAnswer] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [operations, setOperations] = useState<ChatResponse["operations"]>([]);
  const [operationResults, setOperationResults] = useState<ChatResponse["results"]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const typingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (typingRef.current) {
        clearTimeout(typingRef.current);
      }
    };
  }, []);

  const hasSuggestions = suggestions.length > 0;

  const suggestionButtons = useMemo(
    () =>
      suggestions.map((suggestion) => ({
        label: suggestion,
        onSelect: () => {
          setQuery(suggestion);
          submitPrompt(suggestion);
        },
      })),
    [suggestions]
  );

  const submitPrompt = useCallback(
    async (prompt?: string) => {
      const text = (prompt ?? query).trim();
      if (!text) return;

      setIsLoading(true);
      setError(null);
      setAnswer(null);
      setDisplayAnswer("");
       setOperations([]);
       setOperationResults([]);
      if (typingRef.current) {
        clearTimeout(typingRef.current);
        typingRef.current = null;
      }

      try {
        const response = await fetch("/api/assistant/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, history }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Something went wrong. Please try again.");
        }

        const data: ChatResponse = await response.json();
        const reply = data.answer?.trim();
        if (!reply) {
          throw new Error("No response received from the assistant.");
        }

        setAnswer(reply);
        const typeOut = (content: string, idx = 0) => {
          setDisplayAnswer(content.slice(0, idx + 1));
          if (idx < content.length - 1) {
            typingRef.current = setTimeout(() => typeOut(content, idx + 1), 15);
          } else {
            typingRef.current = null;
          }
        };
        typeOut(reply, 0);

        setOperations(data.operations ?? []);
        setOperationResults(data.results ?? []);
        setHistory((prev) => [...prev, { question: text, answer: reply }]);
      } catch (err: any) {
        setError(err.message || "Failed to reach the assistant.");
      } finally {
        setIsLoading(false);
      }
    },
    [query, history]
  );

  return (
    <div className="mt-10 w-full max-w-[56rem] space-y-6">
      <form
        className="group relative flex items-center"
        onSubmit={(event) => {
          event.preventDefault();
          submitPrompt();
        }}
      >
        <div className="absolute left-3 flex h-10 w-10 items-center justify-center text-lg text-[#151515]/60">
          +
        </div>
        <input
          type="text"
          placeholder="Ask anything"
          aria-label="Ask anything"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitPrompt();
            }
          }}
          className="w-full rounded-full border border-[#3166bf] bg-[#ffffff] py-4 pl-14 pr-32 text-base text-[#151515] placeholder:text-[#9ca3af] transition focus:border-[#3166bf] focus:outline-none focus:ring-2 focus:ring-[#3166bf]/20"
        />
        <div className="absolute right-3 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#151515]/40 transition hover:text-[#151515]"
            aria-label="Use microphone"
            disabled
          >
            <Mic size={18} />
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-[#3166bf] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#2a5aa8] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Thinking
              </>
            ) : (
              <>
                <img src="/brand/logo-new.png" alt="" className="h-4 w-4" />
                Ask Drift
              </>
            )}
          </button>
        </div>
      </form>

      {hasSuggestions && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-[#151515]/60 lg:justify-center">
          {suggestionButtons.map(({ label, onSelect }) => (
            <button
              key={label}
              type="button"
              onClick={onSelect}
              className="flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-hover)] px-3 py-1 text-[#151515]/70 transition hover:border-[#3166bf]/40 hover:bg-[#e5e7eb] hover:text-[#151515]"
            >
              <img src="/brand/logo-new.png" alt="" className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {(answer || error || isLoading) && (
        <div className="rounded-3xl border border-[var(--glass-border)] bg-[#ffffff] p-6 text-left shadow-sm">
          {isLoading && (
            <div className="flex items-center gap-3 text-sm text-[#151515]/70">
              <Loader2 className="h-4 w-4 animate-spin text-[#3166bf]" />
              Generating a response…
            </div>
          )}

          {!isLoading && error && (
            <div className="flex items-start gap-3 text-sm text-[#f0494a]">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <p>{error}</p>
            </div>
          )}

          {!isLoading && !error && (displayAnswer || answer) && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[#151515]/60">Drift says</p>
              <p className="whitespace-pre-wrap text-base leading-7 text-[#151515]">
                {displayAnswer || answer}
              </p>
            </div>
          )}

          {!isLoading && !error && operationResults && operationResults.length > 0 && (
            <div className="mt-6 space-y-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-hover)] p-4 text-sm text-[#151515]/70">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-left text-xs uppercase tracking-[0.3em] text-[#151515]/60"
              >
                <span className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-[#151515]/60" />
                  Operations executed
                </span>
                <span>{isExpanded ? "Hide" : "Show"}</span>
              </button>

              {isExpanded && (
                <ul className="space-y-3 text-xs text-[#151515]/70">
                  {operationResults.map((result, idx) => (
                    <li
                      key={`${result.action}-${idx}`}
                      className="rounded-xl border border-[var(--glass-border)] bg-[#ffffff] p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#151515]">{result.action}</span>
                        {result.status === "ok" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#70d4b4]/40 bg-[#ebf9ef] px-2 py-1 text-[11px] font-semibold text-[#e8f6f3]">
                            <CheckCircle2 className="h-3 w-3" />
                            Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#f0494a]/40 bg-[#fef2f2] px-2 py-1 text-[11px] font-semibold text-[#f0494a]">
                            <XCircle className="h-3 w-3" />
                            Failed
                          </span>
                        )}
                      </div>
                      {operations?.[idx]?.args && Object.keys(operations[idx].args || {}).length > 0 && (
                        <div className="mt-2 text-[#151515]/60">
                          <p className="font-semibold text-[11px] uppercase tracking-[0.3em] text-[#151515]/60">
                            Args
                          </p>
                          <pre className="mt-1 overflow-auto rounded-lg bg-[var(--glass-hover)] p-2 text-[11px] text-[#151515]/70">
                            {JSON.stringify(operations[idx].args, null, 2)}
                          </pre>
                        </div>
                      )}
                      {result.status === "ok" && result.data !== undefined && (
                        <div className="mt-2 text-[#151515]/60">
                          <p className="font-semibold text-[11px] uppercase tracking-[0.3em] text-[#151515]/60">
                            Data
                          </p>
                          <pre className="mt-1 overflow-auto rounded-lg bg-[var(--glass-hover)] p-2 text-[11px] text-[#151515]/70">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {result.status === "error" && result.error && (
                        <p className="mt-2 text-[#f0494a]">{result.error}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

