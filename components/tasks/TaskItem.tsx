// components/tasks/TaskItem.tsx
"use client";

import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "@/components/ui/toast";

export interface TaskModel {
  id: string;
  title: string;
  details: string | null;
  status: "open" | "done" | string;
  due_at: string | null;
  created_at: string;
}

export default function TaskItem({ task }: { task: TaskModel }) {
  const [local, setLocal] = useState<TaskModel>(task);
  const [saving, setSaving] = useState(false);

  async function toggleDone() {
    setSaving(true);
    const next = local.status === "done" ? "open" : "done";
    setLocal({ ...local, status: next });
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: next })
        .eq("id", local.id);
      if (error) {
        // revert on error
        setLocal({ ...local, status: local.status });
        toast.error("Failed to update task", error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 flex items-start justify-between gap-3",
        local.status === "done" && "opacity-70"
      )}
    >
      <div>
        <div className="font-medium">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={local.status === "done"}
              onChange={toggleDone}
              disabled={saving}
            />
            <span
              className={cn(
                local.status === "done" && "line-through"
              )}
            >
              {local.title}
            </span>
          </label>
        </div>
        {local.details ? (
          <div className="text-sm text-muted-foreground">{local.details}</div>
        ) : null}
        <div className="text-xs text-muted-foreground mt-1">
          {local.due_at ? `Due ${new Date(local.due_at).toLocaleString()} • ` : ""}
          {local.status}
        </div>
      </div>
    </div>
  );
}
