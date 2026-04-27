"use client";

// PropertyDetailClient — edit fields, status transitions, and link
// clients (buyer / seller / tenant / etc.) loosely. The link is in
// property_clients (multi-role per contact, multi-contact per
// property), with a flat search UI for picking a contact from this
// workspace.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  X,
  UserPlus,
  Search,
} from "lucide-react";

interface Property {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  kind: string | null;
  list_price_cents: number | null;
  status: string;
  listed_at: string | null;
  sold_at: string | null;
  notes: string | null;
  clients: Array<{
    contact_id: string;
    role: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  }>;
}

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "sold", label: "Sold" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "off_market", label: "Off-market" },
] as const;

const KIND_OPTIONS = [
  { value: "", label: "—" },
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "rental", label: "Rental" },
  { value: "land", label: "Land" },
  { value: "other", label: "Other" },
] as const;

const ROLE_OPTIONS = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "co_buyer", label: "Co-buyer" },
  { value: "co_seller", label: "Co-seller" },
  { value: "tenant", label: "Tenant" },
  { value: "landlord", label: "Landlord" },
  { value: "other", label: "Other" },
] as const;

export default function PropertyDetailClient({
  propertyId,
}: {
  propertyId: string;
}) {
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Editable form state.
  const [form, setForm] = useState({
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip: "",
    beds: "",
    baths: "",
    sqft: "",
    kind: "",
    list_price_dollars: "",
    status: "active",
    notes: "",
  });

  // Client linking state.
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerRole, setPickerRole] = useState<string>("buyer");

  const loadProperty = useCallback(async () => {
    try {
      const r = await fetch(`/api/properties/${propertyId}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed to load");
      const p: Property = await r.json();
      setProperty(p);
      setForm({
        address_line1: p.address_line1 || "",
        address_line2: p.address_line2 || "",
        city: p.city || "",
        state: p.state || "",
        zip: p.zip || "",
        beds: p.beds != null ? String(p.beds) : "",
        baths: p.baths != null ? String(p.baths) : "",
        sqft: p.sqft != null ? String(p.sqft) : "",
        kind: p.kind || "",
        list_price_dollars:
          p.list_price_cents != null
            ? (p.list_price_cents / 100).toString()
            : "",
        status: p.status,
        notes: p.notes || "",
      });
    } catch (e: any) {
      setLoadError(e.message || "Failed to load");
    }
  }, [propertyId]);

  useEffect(() => {
    loadProperty();
  }, [loadProperty]);

  useEffect(() => {
    fetch("/api/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setContacts(Array.isArray(d) ? d : []))
      .catch(() => setContacts([]));
  }, []);

  const dirty = useMemo(() => {
    if (!property) return false;
    const orig = {
      address_line1: property.address_line1 || "",
      address_line2: property.address_line2 || "",
      city: property.city || "",
      state: property.state || "",
      zip: property.zip || "",
      beds: property.beds != null ? String(property.beds) : "",
      baths: property.baths != null ? String(property.baths) : "",
      sqft: property.sqft != null ? String(property.sqft) : "",
      kind: property.kind || "",
      list_price_dollars:
        property.list_price_cents != null
          ? (property.list_price_cents / 100).toString()
          : "",
      status: property.status,
      notes: property.notes || "",
    };
    return JSON.stringify(orig) !== JSON.stringify(form);
  }, [property, form]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        beds: form.beds === "" ? null : Number(form.beds),
        baths: form.baths === "" ? null : Number(form.baths),
        sqft: form.sqft === "" ? null : Number(form.sqft),
        kind: form.kind || null,
        list_price_cents:
          form.list_price_dollars === ""
            ? null
            : Math.round(parseFloat(form.list_price_dollars) * 100),
        status: form.status,
        notes: form.notes,
      };
      const r = await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Save failed");
      setSavedAt(Date.now());
      await loadProperty();
    } catch (e: any) {
      setSaveError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this property? This cannot be undone.")) return;
    const r = await fetch(`/api/properties/${propertyId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) router.push("/properties");
    else alert("Failed to delete");
  };

  const linkContact = async (contactId: string) => {
    const r = await fetch(`/api/properties/${propertyId}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ contact_id: contactId, role: pickerRole }),
    });
    if (r.ok) {
      setLinkPickerOpen(false);
      setPickerSearch("");
      await loadProperty();
    }
  };

  const unlinkContact = async (contactId: string, role: string) => {
    const r = await fetch(
      `/api/properties/${propertyId}/clients?contact_id=${contactId}&role=${role}`,
      { method: "DELETE", credentials: "include" }
    );
    if (r.ok) await loadProperty();
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
            href="/properties"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Back to properties
          </Link>
        </div>
      </div>
    );
  }

  if (!property) {
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

  const filteredContacts = contacts.filter((c) => {
    if (!pickerSearch.trim()) return true;
    const q = pickerSearch.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
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
            <Link href="/properties" className="hover:text-[var(--ink)] transition">
              Properties
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)] truncate max-w-[300px]">
              {property.address_line1}
            </span>
          </div>
          <Link
            href="/properties"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Properties
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <div className="label-section mb-2">Property</div>
          <h1 className="heading-display text-4xl text-[var(--ink)]">
            {property.address_line1}
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            {[property.city, property.state, property.zip]
              .filter(Boolean)
              .join(", ") || "—"}
          </p>
        </div>

        {/* Address */}
        <section className="card-flat p-6">
          <div className="label-section mb-4">Address</div>
          <div className="grid md:grid-cols-2 gap-3">
            <input
              value={form.address_line1}
              onChange={(e) =>
                setForm({ ...form, address_line1: e.target.value })
              }
              placeholder="Street address"
              className={`${inputClass} md:col-span-2`}
            />
            <input
              value={form.address_line2}
              onChange={(e) =>
                setForm({ ...form, address_line2: e.target.value })
              }
              placeholder="Unit / suite (optional)"
              className={`${inputClass} md:col-span-2`}
            />
            <input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="City"
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="State"
                className={inputClass}
              />
              <input
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
                placeholder="ZIP"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Specs */}
        <section className="card-flat p-6">
          <div className="label-section mb-4">Specs</div>
          <div className="grid md:grid-cols-4 gap-3">
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">Beds</div>
              <input
                value={form.beds}
                onChange={(e) => setForm({ ...form, beds: e.target.value })}
                type="number"
                min="0"
                className={inputClass}
              />
            </label>
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">Baths</div>
              <input
                value={form.baths}
                onChange={(e) => setForm({ ...form, baths: e.target.value })}
                type="number"
                min="0"
                step="0.5"
                className={inputClass}
              />
            </label>
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">Sqft</div>
              <input
                value={form.sqft}
                onChange={(e) => setForm({ ...form, sqft: e.target.value })}
                type="number"
                min="0"
                className={inputClass}
              />
            </label>
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">Kind</div>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className={inputClass}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Money + status */}
        <section className="card-flat p-6">
          <div className="label-section mb-4">Lifecycle</div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">
                List price (USD)
              </div>
              <input
                value={form.list_price_dollars}
                onChange={(e) =>
                  setForm({ ...form, list_price_dollars: e.target.value })
                }
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 750000"
                className={inputClass}
              />
            </label>
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">Status</div>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Notes */}
        <section className="card-flat p-6">
          <div className="label-section mb-4">Notes</div>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={5}
            placeholder="Anything that doesn't fit elsewhere — disclosures, showing instructions, owner preferences."
            className={`${inputClass} resize-y`}
          />
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
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Delete property
          </button>
        </div>

        {/* Linked clients */}
        <section className="card-flat p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="label-section mb-1">People</div>
              <h2 className="text-base font-semibold">Linked clients</h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5 max-w-xl">
                Loose links — a contact can be linked at multiple roles, and
                clients exist independently of properties.
              </p>
            </div>
            <button
              onClick={() => setLinkPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
            >
              {linkPickerOpen ? (
                <>
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} /> Cancel
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" strokeWidth={1.5} /> Link client
                </>
              )}
            </button>
          </div>

          {linkPickerOpen && (
            <div className="mb-5 border border-[var(--rule)] rounded-[4px] p-3 bg-[var(--canvas-subtle)]">
              <div className="flex flex-col md:flex-row gap-3 mb-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                  <input
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search contacts by name, email, phone…"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <select
                  value={pickerRole}
                  onChange={(e) => setPickerRole(e.target.value)}
                  className={`${inputClass} md:w-40`}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                {filteredContacts.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--ink-subtle)]">
                    No contacts match. Add contacts in /contacts first.
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

          {property.clients.length === 0 ? (
            <p className="text-xs text-[var(--ink-subtle)]">
              No clients linked yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
              {property.clients.map((c) => (
                <li
                  key={`${c.contact_id}-${c.role}`}
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
                  <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-muted)] px-2 py-0.5 rounded-full border border-[var(--rule)]">
                    {c.role.replace("_", " ")}
                  </span>
                  <button
                    onClick={() => unlinkContact(c.contact_id, c.role)}
                    className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                    title="Remove link"
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
