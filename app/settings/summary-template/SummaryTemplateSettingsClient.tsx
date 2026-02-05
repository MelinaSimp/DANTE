"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type WorkspaceDocument = {
  id: string;
  file_name: string;
  contact_id: string;
  contact_name: string;
};

interface SummaryTemplateSettingsClientProps {
  initialTemplateId: string | null;
  documents: WorkspaceDocument[];
}

export default function SummaryTemplateSettingsClient({
  initialTemplateId,
  documents,
}: SummaryTemplateSettingsClientProps) {
  const [selectedId, setSelectedId] = useState<string>(initialTemplateId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary_template_document_id: selectedId === "" ? null : selectedId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save" });
        return;
      }
      setMessage({ type: "success", text: "Summary template saved." });
    } catch (e) {
      setMessage({ type: "error", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = (initialTemplateId ?? "") !== selectedId;

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="template-doc" className="mb-2 block text-sm font-medium text-white/80">
          Summary template document
        </label>
        <p className="mb-3 max-w-2xl text-sm text-white/60">
          Choose a document whose annotations define the structure of one-page summaries. When generating a summary for a client, the AI will use this template&apos;s pages and labels but pull content from the client&apos;s document.
        </p>
        <select
          id="template-doc"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full max-w-md rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white focus:border-[#3351ff]/50 focus:outline-none focus:ring-1 focus:ring-[#3351ff]/50"
        >
          <option value="">None</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.contact_name} – {d.file_name}
            </option>
          ))}
        </select>
        {documents.length === 0 && (
          <p className="mt-2 text-sm text-white/50">
            No documents in this workspace yet. Upload a PDF for a client first, then annotate it and select it here.
          </p>
        )}
      </div>

      {message && (
        <p
          className={
            message.type === "success"
              ? "text-sm text-emerald-400"
              : "text-sm text-red-400"
          }
        >
          {message.text}
        </p>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        className="rounded-xl bg-[#3351ff] px-6 py-2.5 text-white hover:bg-[#3351ff]/90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
