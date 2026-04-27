"use client";

// VaultItemDetailClient — edit metadata, link clients, link a property,
// open the underlying file. We intentionally don't allow content
// replacement here; deletion + re-upload keeps the audit trail clean.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  X,
  UserPlus,
  Search,
  Eye,
  Sparkles,
  ScrollText,
  Home,
  Plus,
} from "lucide-react";
import FillTemplateButton from "./FillTemplateButton";

interface VaultItem {
  id: string;
  kind: "template" | "document";
  title: string;
  description: string | null;
  file_url: string | null;
  file_size: number | null;
  file_type: string | null;
  property_id: string | null;
  created_at: string;
  updated_at: string;
  clients: Array<{
    contact_id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  }>;
  property: { id: string; address_line1: string; city: string | null } | null;
}

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface Property {
  id: string;
  address_line1: string;
  city: string | null;
}

export default function VaultItemDetailClient({
  itemId,
}: {
  itemId: string;
}) {
  const router = useRouter();
  const [item, setItem] = useState<VaultItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    kind: "document" as "template" | "document",
    property_id: "" as string,
  });

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/vault/${itemId}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      const data: VaultItem = await r.json();
      setItem(data);
      setForm({
        title: data.title,
        description: data.description || "",
        kind: data.kind,
        property_id: data.property_id || "",
      });
    } catch (e: any) {
      setLoadError(e.message);
    }
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setContacts(Array.isArray(d) ? d : []))
      .catch(() => setContacts([]));
    fetch("/api/properties", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProperties(Array.isArray(d) ? d : []))
      .catch(() => setProperties([]));
  }, []);

  const dirty = useMemo(() => {
    if (!item) return false;
    return (
      form.title !== item.title ||
      form.description !== (item.description || "") ||
      form.kind !== item.kind ||
      form.property_id !== (item.property_id || "")
    );
  }, [item, form]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`/api/vault/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          kind: form.kind,
          property_id: form.property_id || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Save failed");
      setSavedAt(Date.now());
      await load();
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this item from the vault? This cannot be undone."))
      return;
    const r = await fetch(`/api/vault/${itemId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) router.push("/vault");
    else alert("Failed to delete");
  };

  const linkContact = async (contactId: string) => {
    const r = await fetch(`/api/vault/${itemId}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ contact_id: contactId }),
    });
    if (r.ok) {
      setLinkOpen(false);
      setPickerSearch("");
      await load();
    }
  };

  const unlinkContact = async (contactId: string) => {
    const r = await fetch(
      `/api/vault/${itemId}/clients?contact_id=${contactId}`,
      { method: "DELETE", credentials: "include" }
    );
    if (r.ok) await load();
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center px-6">
        <div className="card-flat p-6 text-center max-w-md">
          <AlertCircle
            className="w-8 h-8 text-[var(--danger)] mx-auto mb-3"
            strokeWidth={1.5}
          />
          <p className="text-sm text-[var(--ink)] mb-2">{loadError}</p>
          <Link
            href="/vault"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Back to Vault
          </Link>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <Loader2
          className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
          strokeWidth={1.5}
        />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  const linkedIds = new Set(item.clients.map((c) => c.contact_id));
  const filteredContacts = contacts
    .filter((c) => !linkedIds.has(c.id))
    .filter((c) => {
      if (!pickerSearch.trim()) return true;
      const q = pickerSearch.toLowerCase();
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
      );
    });

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <Link href="/vault" className="hover:text-[var(--ink)] transition">
              Vault
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)] truncate max-w-[300px]">
              {item.title}
            </span>
          </div>
          <Link
            href="/vault"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Vault
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div className="flex items-center gap-3">
          {item.kind === "template" ? (
            <Sparkles
              className="w-5 h-5 text-[var(--accent)]"
              strokeWidth={1.5}
            />
          ) : (
            <ScrollText
              className="w-5 h-5 text-[var(--ink-muted)]"
              strokeWidth={1.5}
            />
          )}
          <div className="flex-1">
            <div className="label-section mb-1">
              {item.kind === "template" ? "Template" : "Document"}
            </div>
            <h1 className="heading-display text-3xl text-[var(--ink)]">
              {item.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {item.file_url && (
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
              >
                <Eye className="w-3.5 h-3.5" strokeWidth={1.5} /> Open file
              </a>
            )}
            {item.kind === "template" && (
              <FillTemplateButton
                templateId={item.id}
                templateTitle={item.title}
                initialPropertyId={item.property_id}
              />
            )}
          </div>
        </div>

        {/* Metadata */}
        <section className="card-flat p-6">
          <div className="label-section mb-4">Metadata</div>
          <div className="grid md:grid-cols-3 gap-3 mb-4">
            <label className="block">
              <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                Type
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["document", "template"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setForm({ ...form, kind: k })}
                    className="text-sm px-3 py-2 transition"
                    style={{
                      border:
                        form.kind === k
                          ? "1px solid var(--ink)"
                          : "1px solid var(--rule)",
                      background:
                        form.kind === k
                          ? "var(--canvas-subtle)"
                          : "var(--canvas)",
                      color: "var(--ink)",
                      fontWeight: form.kind === k ? 600 : 400,
                      borderRadius: "var(--r-input)",
                    }}
                  >
                    {k === "template" ? "Template" : "Document"}
                  </button>
                ))}
              </div>
            </label>
            <label className="block md:col-span-2">
              <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                Title
              </div>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block">
            <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
              Description
              {form.kind === "template" && (
                <span className="text-[10px] text-[var(--ink-subtle)] font-normal ml-1">
                  — Vergil reads this to decide when to use the template
                </span>
              )}
            </div>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={4}
              placeholder={
                form.kind === "template"
                  ? "Use this for cash offers on residential listings in Texas. Includes seller-fills-title-fee clause."
                  : "Anything you want to remember about this doc."
              }
              className={`${inputClass} resize-y`}
            />
          </label>
        </section>

        {/* Linked property */}
        <section className="card-flat p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="label-section mb-1">Property</div>
              <h2 className="text-base font-semibold">Linked property</h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                Optional. Helps Vergil pull the right docs when you're
                discussing a specific listing.
              </p>
            </div>
          </div>
          <select
            value={form.property_id}
            onChange={(e) => setForm({ ...form, property_id: e.target.value })}
            className={inputClass}
          >
            <option value="">— No property —</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address_line1}
                {p.city ? `, ${p.city}` : ""}
              </option>
            ))}
          </select>
          {item.property && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
              <Home className="w-3 h-3" strokeWidth={1.5} />
              <Link
                href={`/properties/${item.property.id}`}
                className="hover:text-[var(--accent)] underline underline-offset-2"
              >
                Open {item.property.address_line1}
              </Link>
            </div>
          )}
        </section>

        {/* Save strip */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Save className="w-4 h-4" strokeWidth={1.5} />
            )}
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && !saving && !saveError && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--verified)]">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Saved
            </span>
          )}
          {saveError && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--danger)]">
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
              {saveError}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={remove}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft)] text-xs font-medium transition"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Delete
          </button>
        </div>

        {/* Linked clients */}
        <section className="card-flat p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="label-section mb-1">People</div>
              <h2 className="text-base font-semibold">Tagged clients</h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                Loose links. Vergil uses these tags when you ask for docs
                related to a specific client.
              </p>
            </div>
            <button
              onClick={() => setLinkOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
            >
              {linkOpen ? (
                <>
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} /> Cancel
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" strokeWidth={1.5} /> Tag client
                </>
              )}
            </button>
          </div>

          {linkOpen && (
            <div className="mb-5 border border-[var(--rule)] rounded-[4px] p-3 bg-[var(--canvas-subtle)]">
              <div className="relative mb-3">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
                  strokeWidth={1.5}
                />
                <input
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search contacts…"
                  className={`${inputClass} pl-9`}
                />
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                {filteredContacts.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--ink-subtle)]">
                    No contacts to add.
                  </div>
                ) : (
                  filteredContacts.slice(0, 20).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => linkContact(c.id)}
                      className="w-full text-left py-2 px-2 hover:bg-[var(--canvas)] transition flex items-center gap-3"
                    >
                      <Plus
                        className="w-3.5 h-3.5 text-[var(--ink-subtle)]"
                        strokeWidth={1.5}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[var(--ink)] truncate">
                          {c.name || "(no name)"}
                        </div>
                        <div className="text-[11px] text-[var(--ink-subtle)] truncate">
                          {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {item.clients.length === 0 ? (
            <p className="text-xs text-[var(--ink-subtle)]">
              No clients tagged.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
              {item.clients.map((c) => (
                <li
                  key={c.contact_id}
                  className="py-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--ink)] truncate">
                      {c.name || "(no name)"}
                    </div>
                    <div className="text-[11px] text-[var(--ink-subtle)] truncate">
                      {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <button
                    onClick={() => unlinkContact(c.contact_id)}
                    className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                    title="Remove tag"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
