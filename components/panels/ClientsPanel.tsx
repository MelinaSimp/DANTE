"use client";

import { useState, useEffect } from "react";
import { UserPlus, Search, Trash2, Phone, Mail, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

interface Contact { id: string; name: string; phone?: string; email?: string }

export default function ClientsPanel({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/contacts", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => setContacts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() || undefined, email: newEmail.trim() || undefined }) });
      if (r.ok) {
        const c = await r.json();
        setContacts(prev => [c, ...prev]);
        setNewName(""); setNewPhone(""); setNewEmail(""); setAdding(false);
      }
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/contacts/${id}`, { method: "DELETE", credentials: "include" });
      if (r.ok) setContacts(prev => prev.filter(c => c.id !== id));
    } catch {} finally { setDeletingId(null); }
  };

  const filtered = searchQuery
    ? contacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.email || "").toLowerCase().includes(searchQuery.toLowerCase()) || (c.phone || "").includes(searchQuery))
    : contacts;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search clients..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-black/5" />
        </div>
        <div className="flex items-center gap-2 ml-3">
          <button onClick={() => router.push("/client-details-overview")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition">
            <ExternalLink className="w-3.5 h-3.5" />Full View
          </button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800">
            <UserPlus className="w-4 h-4" />Add
          </button>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name *" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5" />
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5" />
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!newName.trim() || saving} className="px-4 py-2 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-40">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading clients...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <UserPlus className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">{searchQuery ? "No clients match your search" : "No clients yet"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="group flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {c.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {c.phone && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{c.phone}</span>}
                  {c.email && <span className="flex items-center gap-1 text-xs text-gray-500"><Mail className="w-3 h-3" />{c.email}</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}
                className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
