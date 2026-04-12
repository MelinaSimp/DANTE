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
  if (action.endsWith(".deleted") || action.endsWith(".revoked") || action.endsWith(".removed")) {
    return "bg-red-500/10 text-red-300 border-red-500/20";
  }
  if (action.endsWith(".created") || action.endsWith(".deployed") || action.endsWith(".connected") || action.endsWith(".enabled")) {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  }
  if (action.endsWith(".updated") || action.endsWith(".role_changed") || action.endsWith(".configured")) {
    return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  }
  return "bg-white/5 text-white/70 border-white/15";
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
      <div className="rounded-2xl border border-white/10 bg-black/30">
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by action, actor, or target…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder:text-white/30 focus:border-[#3351ff] focus:outline-none focus:ring-2 focus:ring-[#3351ff]/30 transition"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 py-12 text-center text-sm text-white/50">
          No events match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium">When</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
                <th className="px-4 py-3 text-left font-medium">Actor</th>
                <th className="px-4 py-3 text-left font-medium">Target</th>
                <th className="px-4 py-3 text-left font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition">
                  <td className="px-4 py-3 whitespace-nowrap text-white/70">
                    {formatTime(log.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${actionTone(log.action)}`}>
                      {formatAction(log.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {log.actor_email || <span className="text-white/30">system</span>}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {log.target_label ? (
                      <span>
                        {log.target_label}
                        {log.target_type && (
                          <span className="ml-1 text-white/30 text-xs">({log.target_type})</span>
                        )}
                      </span>
                    ) : log.target_type ? (
                      <span className="text-white/40">{log.target_type}</span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/50 font-mono text-xs">
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
