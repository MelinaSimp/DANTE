"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollText, Search } from "lucide-react";

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

function formatAction(action: string) {
  return action
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .join(" · ");
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionTone(action: string): string {
  if (
    action.endsWith(".deleted") ||
    action.endsWith(".revoked") ||
    action.endsWith(".removed")
  ) {
    return "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/30";
  }
  if (
    action.endsWith(".created") ||
    action.endsWith(".deployed") ||
    action.endsWith(".connected") ||
    action.endsWith(".enabled")
  ) {
    return "bg-[var(--verified-soft)] text-[var(--verified)] border-[var(--verified)]/30";
  }
  if (
    action.endsWith(".updated") ||
    action.endsWith(".role_changed") ||
    action.endsWith(".configured")
  ) {
    return "bg-[var(--flag-soft)] text-[var(--flag)] border-[var(--flag)]/30";
  }
  return "bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border-[var(--rule)]";
}

export default function AuditLogClient({ initialLogs }: { initialLogs: AuditLogRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = query
    ? initialLogs.filter((log) => {
        const q = query.toLowerCase();
        return (
          log.action.toLowerCase().includes(q) ||
          (log.actor_email || "").toLowerCase().includes(q) ||
          (log.target_label || "").toLowerCase().includes(q) ||
          (log.target_type || "").toLowerCase().includes(q)
        );
      })
    : initialLogs;

  if (initialLogs.length === 0) {
    return (
      <div className="card-flat">
        <EmptyState
          icon={ScrollText}
          title="No audit events yet"
          description="As soon as your team takes a sensitive action — deploying an agent, inviting a member, rotating an API key — it will show up here with the actor, timestamp, and target."
        />
      </div>
    );
  }

  return (
    <div>
      <div className="relative mb-4">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-subtle)]"
          strokeWidth={1.5}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by action, actor, or target…"
          className="w-full pl-10 pr-4 py-2.5 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card-flat py-12 text-center text-sm text-[var(--ink-muted)]">
          No events match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="card-flat overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--canvas-subtle)] border-b border-[var(--rule)]">
              <tr>
                <th className="label-section text-left px-4 py-3">When</th>
                <th className="label-section text-left px-4 py-3">Action</th>
                <th className="label-section text-left px-4 py-3">Actor</th>
                <th className="label-section text-left px-4 py-3">Target</th>
                <th className="label-section text-left px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr
                  key={log.id}
                  className="border-t border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition"
                >
                  <td className="px-4 py-3 whitespace-nowrap mono text-xs text-[var(--ink-muted)]">
                    {formatTime(log.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${actionTone(
                        log.action
                      )}`}
                    >
                      {formatAction(log.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink)]">
                    {log.actor_email || (
                      <span className="text-[var(--ink-subtle)]">system</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink)]">
                    {log.target_label ? (
                      <span>
                        {log.target_label}
                        {log.target_type && (
                          <span className="ml-1 text-[var(--ink-subtle)] text-xs">
                            ({log.target_type})
                          </span>
                        )}
                      </span>
                    ) : log.target_type ? (
                      <span className="text-[var(--ink-muted)]">{log.target_type}</span>
                    ) : (
                      <span className="text-[var(--ink-subtle)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 mono text-xs text-[var(--ink-muted)]">
                    {log.ip_address || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
