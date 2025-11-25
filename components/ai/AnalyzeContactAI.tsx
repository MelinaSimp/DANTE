// components/ai/AnalyzeContactAI.tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface NoteLite { id: string; body: string; created_at: string }

export default function AnalyzeContactAI({
  contactId,
  workspaceId,
}: {
  contactId: string;
  workspaceId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<NoteLite[] | null>(null);
  const [summary, setSummary] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<
    { title: string; details?: string | null; due_at?: string | null }[]
  >([]);

  async function loadNotes() {
    const { data, error } = await supabase
      .from("notes")
      .select("id, body, created_at")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });
    if (error) {
      alert(error.message);
      return [];
    }
    return (data as NoteLite[]) || [];
  }

  async function analyze() {
    setLoading(true);
    try {
      const n = await loadNotes();
      setNotes(n);

      const resp = await fetch("/api/ai/analyze-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, workspaceId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data?.error || "Analysis failed");
        return;
      }

      setSummary(data.summary || "");
      setKeywords(Array.isArray(data.keywords) ? data.keywords : []);
      setSuggested(Array.isArray(data.suggested_tasks) ? data.suggested_tasks : []);
    } finally {
      setLoading(false);
    }
  }

  async function addTasks() {
    if (!suggested.length) return;
    const rows = suggested.map((t) => ({
      workspace_id: workspaceId,
      contact_id: contactId,
      title: t.title,
      details: t.details ?? null,
      status: "open",
      due_at: t.due_at ?? null,
    }));
    const { error } = await supabase.from("tasks").insert(rows);
    if (error) {
      alert(error.message);
      return;
    }
    // reload page to show tasks block updated
    location.reload();
  }

  return (
    <div className="space-y-4">
      <Button 
        onClick={analyze} 
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 font-medium py-3"
      >
        {loading ? (
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Analyzing…
          </div>
        ) : (
          "Analyze Notes with AI"
        )}
      </Button>

      {summary && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-700 mb-3">Summary</div>
          <div className="text-sm text-gray-600 bg-white rounded-lg p-3">{summary}</div>
        </div>
      )}

      {keywords.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-700 mb-3">Keywords</div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((k, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium border border-blue-200">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-700 mb-3">
            Suggested Tasks ({suggested.length})
          </div>
          <div className="space-y-3 mb-4">
            {suggested.map((t, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="font-medium text-gray-800 text-sm">{t.title}</div>
                {t.details && <div className="text-gray-600 text-xs mt-1">{t.details}</div>}
                {t.due_at && <div className="text-gray-500 text-xs mt-1">Due: {t.due_at}</div>}
              </div>
            ))}
          </div>
          <Button
            onClick={addTasks}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
            size="sm"
          >
            Add {suggested.length} Task(s)
          </Button>
        </div>
      )}
    </div>
  );
}
