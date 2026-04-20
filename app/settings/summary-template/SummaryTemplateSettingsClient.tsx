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
    } catch {
      setMessage({ type: "error", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = (initialTemplateId ?? "") !== selectedId;

  return (
    <div className="space-y-6">
      <div>
        <label
          htmlFor="template-doc"
          className="label-section mb-1.5 block"
        >
          Summary template document
        </label>
        <p className="mb-3 max-w-2xl text-sm text-[var(--ink-muted)]">
          Choose a document whose annotations define the structure of one-page summaries. When
          generating a summary for a client, the AI will use this template&apos;s pages and labels
          but pull content from the client&apos;s document.
        </p>
        <select
          id="template-doc"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full max-w-md rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
        >
          <option value="">None</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.contact_name} – {d.file_name}
            </option>
          ))}
        </select>
        {documents.length === 0 && (
          <p className="mt-2 text-sm text-[var(--ink-subtle)]">
            No documents in this workspace yet. Upload a PDF for a client first, then annotate it
            and select it here.
          </p>
        )}
      </div>

      {message && (
        <p
          className={
            message.type === "success"
              ? "text-sm text-[var(--verified)]"
              : "text-sm text-[var(--danger)]"
          }
        >
          {message.text}
        </p>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        className="rounded-[4px] bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
