"use client";

import { useState, useEffect } from "react";
import { reportError } from "@/lib/report-error";

export default function InstructionsPanel({ agentId }: { agentId: string }) {
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/agents/${agentId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setInstructions(d.llm_instructions || ""); })
      .catch(reportError("InstructionsPanel: load agent"))
      .finally(() => setLoading(false));
  }, [agentId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm_instructions: instructions.trim() || null }),
      });
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch {} finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-white/40 text-sm">Loading...</div>;

  return (
    <div className="h-full flex flex-col p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Rules & Instructions</h2>
          <p className="text-white/50 text-sm mt-1">Provide rules and instructions for the LLM. The agent will follow these during conversations.</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-medium text-sm transition">
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </div>
      <textarea
        value={instructions}
        onChange={e => setInstructions(e.target.value)}
        placeholder="e.g. You are a friendly support agent. Always greet the customer by name. Keep responses brief and helpful."
        className="flex-1 min-h-[320px] w-full px-4 py-3 rounded-2xl bg-black/60 border border-white/10 text-white placeholder-white/40 text-sm focus:border-cyan-500 focus:outline-none resize-y"
        spellCheck={false}
      />
    </div>
  );
}
