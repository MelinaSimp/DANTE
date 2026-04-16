"use client";

import { Badge } from "@/components/ui/badge";
import { Search, Filter, Users, MoreHorizontal } from "lucide-react";

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

export function ClientsPageClient({ clients }: { clients: ClientRow[] }) {
  return (
    <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white/90">Clients</h1>
          <p className="text-zinc-400 mt-1">Manage relationships, households, and entities.</p>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/5 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-sm w-full">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="search"
                placeholder="Search clients..."
                className="w-full pl-9 h-9 bg-black/40 border border-white/10 rounded-md text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 px-3"
              />
            </div>
            <button className="h-9 w-9 flex items-center justify-center border border-white/10 bg-white/5 rounded-md hover:bg-white/10 transition-colors">
              <Filter className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
          <span className="text-sm text-zinc-500 font-medium">Showing {clients.length} clients</span>
        </div>

        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white/80">No clients yet</h3>
            <p className="text-sm text-zinc-500 mt-1">Start by adding your first client.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-zinc-500 uppercase tracking-wider text-[10px] font-bold w-[250px]">Name</th>
                  <th className="text-left px-4 py-3 text-zinc-500 uppercase tracking-wider text-[10px] font-bold">Type</th>
                  <th className="text-left px-4 py-3 text-zinc-500 uppercase tracking-wider text-[10px] font-bold">AUM</th>
                  <th className="text-left px-4 py-3 text-zinc-500 uppercase tracking-wider text-[10px] font-bold">Risk Profile</th>
                  <th className="text-left px-4 py-3 text-zinc-500 uppercase tracking-wider text-[10px] font-bold">Last Contact</th>
                  <th className="text-left px-4 py-3 text-zinc-500 uppercase tracking-wider text-[10px] font-bold">Tags</th>
                  <th className="text-right px-4 py-3 text-zinc-500 uppercase tracking-wider text-[10px] font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="group border-b border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-medium text-white/90">
                      <div className="flex flex-col">
                        <span>{client.name}</span>
                        <span className="text-[10px] text-zinc-500 mt-0.5 font-mono">{client.id.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-normal text-[10px] bg-white/5 border-white/10 text-zinc-300">{client.type}</Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-400/90">{client.aum}</td>
                    <td className="px-4 py-3 text-zinc-300">{client.riskProfile}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full ${client.churnScore > 60 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"}`} />
                        <span className="text-xs text-zinc-400">{client.lastContact}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {client.tags.map((tag, i) => (
                          <span key={i} className="text-[9px] bg-zinc-800/50 text-zinc-400 px-1.5 py-0.5 rounded border border-white/5">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10">
                        <MoreHorizontal className="h-4 w-4 text-zinc-500" />
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
