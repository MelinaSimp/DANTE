"use client";

import { Search, Filter, Users, MoreHorizontal } from "lucide-react";
import EntityAsk from "@/components/dante/EntityAsk";

interface ClientRow {
  id: string;
  name: string;
  type: string;
  aum: string;
  riskProfile: string;
  churnScore: number;
  lastContact: string;
  tags: string[];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ClientsPageClient({ clients }: { clients: ClientRow[] }) {
  return (
    <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading-display text-4xl">Clients</h1>
          <p className="text-[var(--ink-muted)] mt-1">
            Manage relationships, households, and entities.
          </p>
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--rule)] flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-sm w-full">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--ink-subtle)]" />
              <input
                type="search"
                placeholder="Search clients..."
                className="w-full pl-9 h-9 bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[6px] text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] px-3"
              />
            </div>
            <button className="h-9 w-9 flex items-center justify-center border border-[var(--rule)] bg-[var(--canvas-subtle)] rounded-[6px] hover:bg-[var(--canvas)] transition-colors">
              <Filter className="h-4 w-4 text-[var(--ink-muted)]" />
            </button>
          </div>
          <span className="text-sm text-[var(--ink-muted)] font-medium">
            Showing {clients.length} clients
          </span>
        </div>

        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Users className="h-10 w-10 text-[var(--ink-subtle)] mb-4" />
            <h3 className="text-lg font-semibold text-[var(--ink)]">No clients yet</h3>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              Start by adding your first client.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left label-section px-4 py-2 border-b border-[var(--rule)] w-[280px]">
                    Name
                  </th>
                  <th className="text-left label-section px-4 py-2 border-b border-[var(--rule)]">
                    Type
                  </th>
                  <th className="text-left label-section px-4 py-2 border-b border-[var(--rule)]">
                    AUM
                  </th>
                  <th className="text-left label-section px-4 py-2 border-b border-[var(--rule)]">
                    Risk Profile
                  </th>
                  <th className="text-left label-section px-4 py-2 border-b border-[var(--rule)]">
                    Last Contact
                  </th>
                  <th className="text-left label-section px-4 py-2 border-b border-[var(--rule)]">
                    Tags
                  </th>
                  <th className="text-right label-section px-4 py-2 border-b border-[var(--rule)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="group border-b border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-[var(--ink)]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas-subtle)] text-[var(--ink)] text-xs font-medium flex items-center justify-center shrink-0">
                          {getInitials(client.name)}
                        </div>
                        <div className="flex flex-col">
                          <EntityAsk
                            kind="contact"
                            id={client.id}
                            label={client.name}
                          >
                            <span className="font-medium">{client.name}</span>
                          </EntityAsk>
                          <span className="text-[10px] text-[var(--ink-subtle)] mt-0.5 mono">
                            {client.id.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] bg-[var(--canvas-subtle)] border border-[var(--rule)] text-[var(--ink-muted)]">
                        {client.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 mono text-[var(--ink)]">{client.aum}</td>
                    <td className="px-4 py-3 text-[var(--ink-muted)]">{client.riskProfile}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {client.churnScore > 60 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] bg-[var(--danger-soft)] text-[var(--danger)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
                            {client.lastContact}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] chip-verified">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--verified)]" />
                            {client.lastContact}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {client.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-[var(--canvas-subtle)] text-[var(--ink-muted)] px-1.5 py-0.5 rounded-[4px] border border-[var(--rule)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-[4px] hover:bg-[var(--canvas)]">
                        <MoreHorizontal className="h-4 w-4 text-[var(--ink-muted)]" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
