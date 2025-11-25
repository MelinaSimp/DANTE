"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

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
        className="w-full rounded-md border border-black/10 p-3 text-sm"
        rows={3}
        placeholder="Write a note..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Button
        onClick={save}
        disabled={saving || !body.trim()}
        className="px-4 py-2"
      >
        {saving ? "Saving..." : "Save note"}
      </Button>
    </div>
  );
}
