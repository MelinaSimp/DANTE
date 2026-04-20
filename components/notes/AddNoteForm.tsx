"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

// Harvey-styled note composer. Kept deliberately small — matches the
// rest of the per-client rail: white field, 1px rule, ink button.
export default function AddNoteForm({ contactId }: { contactId: string }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await supabase.from("notes").insert({ contact_id: contactId, body });
      setBody("");
      location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition"
        rows={3}
        placeholder="Write a note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !body.trim()}
        className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] transition hover:bg-[var(--ink)]/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save note"}
      </button>
    </div>
  );
}
