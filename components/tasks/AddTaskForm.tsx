// components/tasks/AddTaskForm.tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export default function AddTaskForm({
  workspaceId,
  contactId,
}: {
  workspaceId: string;
  contactId: string;
}) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [due, setDue] = useState<string>(""); // ISO local string
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const due_at = due ? new Date(due).toISOString() : null;
      const { error } = await supabase.from("tasks").insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        title,
        details: details || null,
        status: "open",
        due_at,
      });
      if (error) {
        toast.error("Failed to add task", error.message);
        return;
      }
      setTitle("");
      setDetails("");
      setDue("");
      location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2 md:grid-cols-4">
      <input
        className="rounded-md border px-3 py-2 md:col-span-1"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="rounded-md border px-3 py-2 md:col-span-2"
        placeholder="Details (optional)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <input
        className="rounded-md border px-3 py-2 md:col-span-1"
        type="datetime-local"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <div className="md:col-span-4 flex justify-end">
        <Button onClick={handleAdd} disabled={loading || !title.trim()}>
          {loading ? "Adding…" : "Add Task"}
        </Button>
      </div>
    </div>
  );
}
