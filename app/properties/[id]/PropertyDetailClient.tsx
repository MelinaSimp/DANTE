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
  FileText,
  ExternalLink,
  CalendarClock,
  Upload,
  Download,
  ChevronRight,
} from "lucide-react";
import ContextualAskPanel from "@/components/dante/ContextualAskPanel";
import EntityAsk from "@/components/dante/EntityAsk";

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
  description: string | null;
  interior_features: string[] | null;
  exterior_features: string[] | null;
  year_built: number | null;
  lot_size_sqft: number | null;
  lease_term_months: number | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  monthly_rent_cents: number | null;
  tenant_contact_id: string | null;
  transaction_stage: string | null;
  stage_entered_at: string | null;
  expected_close_date: string | null;
  clients: Array<{
    contact_id: string;
    role: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  }>;
}

interface PropertyDocument {
  id: string;
  title: string;
  doc_kind: string;
  file_path: string | null;
  external_url: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
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

const DOC_KIND_OPTIONS = [
  { value: "lease", label: "Lease" },
  { value: "insurance", label: "Insurance" },
  { value: "inspection", label: "Inspection" },
  { value: "disclosure", label: "Disclosure" },
  { value: "deed", label: "Deed" },
  { value: "hoa", label: "HOA" },
  { value: "comp", label: "Comp" },
  { value: "photo", label: "Photo" },
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
    description: "",
    interior_features: [] as string[],
    exterior_features: [] as string[],
    year_built: "",
    lot_size_sqft: "",
    lease_term_months: "",
    lease_start_date: "",
    lease_end_date: "",
    monthly_rent_dollars: "",
    tenant_contact_id: "",
    expected_close_date_or_empty: "",
  });

  // Feature-chip input buffers — local typing state that flushes to
  // form arrays on Enter / comma.
  const [interiorBuf, setInteriorBuf] = useState("");
  const [exteriorBuf, setExteriorBuf] = useState("");

  // Documents state.
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [docFormOpen, setDocFormOpen] = useState(false);
  const [docDraft, setDocDraft] = useState({
    title: "",
    doc_kind: "lease",
    external_url: "",
    expires_at: "",
    notes: "",
  });
  const [docError, setDocError] = useState<string | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);

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
        description: p.description || "",
        interior_features: Array.isArray(p.interior_features) ? p.interior_features : [],
        exterior_features: Array.isArray(p.exterior_features) ? p.exterior_features : [],
        year_built: p.year_built != null ? String(p.year_built) : "",
        lot_size_sqft: p.lot_size_sqft != null ? String(p.lot_size_sqft) : "",
        lease_term_months:
          p.lease_term_months != null ? String(p.lease_term_months) : "",
        lease_start_date: p.lease_start_date || "",
        lease_end_date: p.lease_end_date || "",
        monthly_rent_dollars:
          p.monthly_rent_cents != null
            ? (p.monthly_rent_cents / 100).toString()
            : "",
        tenant_contact_id: p.tenant_contact_id || "",
        expected_close_date_or_empty: p.expected_close_date || "",
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
      description: property.description || "",
      interior_features: Array.isArray(property.interior_features)
        ? property.interior_features
        : [],
      exterior_features: Array.isArray(property.exterior_features)
        ? property.exterior_features
        : [],
      year_built: property.year_built != null ? String(property.year_built) : "",
      lot_size_sqft:
        property.lot_size_sqft != null ? String(property.lot_size_sqft) : "",
      lease_term_months:
        property.lease_term_months != null ? String(property.lease_term_months) : "",
      lease_start_date: property.lease_start_date || "",
      lease_end_date: property.lease_end_date || "",
      monthly_rent_dollars:
        property.monthly_rent_cents != null
          ? (property.monthly_rent_cents / 100).toString()
          : "",
      tenant_contact_id: property.tenant_contact_id || "",
      expected_close_date_or_empty: property.expected_close_date || "",
    };
    return JSON.stringify(orig) !== JSON.stringify(form);
  }, [property, form]);

  const loadDocuments = useCallback(async () => {
    try {
      const r = await fetch(`/api/properties/${propertyId}/documents`, {
        credentials: "include",
      });
      if (r.ok) {
        const d = await r.json();
        setDocuments(Array.isArray(d) ? d : []);
      }
    } catch {
      /* non-fatal */
    }
  }, [propertyId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

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
        description: form.description.trim() || null,
        interior_features: form.interior_features,
        exterior_features: form.exterior_features,
        year_built: form.year_built === "" ? null : Number(form.year_built),
        lot_size_sqft: form.lot_size_sqft === "" ? null : Number(form.lot_size_sqft),
        lease_term_months:
          form.lease_term_months === "" ? null : Number(form.lease_term_months),
        lease_start_date: form.lease_start_date || null,
        lease_end_date: form.lease_end_date || null,
        monthly_rent_cents:
          form.monthly_rent_dollars === ""
            ? null
            : Math.round(parseFloat(form.monthly_rent_dollars) * 100),
        tenant_contact_id: form.tenant_contact_id || null,
        expected_close_date: form.expected_close_date_or_empty || null,
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

  // Feature chip helpers — lowercase, dedupe, cap at 40.
  const addFeature = (kind: "interior" | "exterior", raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setForm((f) => {
      const key = kind === "interior" ? "interior_features" : "exterior_features";
      const existing = f[key];
      if (existing.length >= 40) return f;
      if (existing.some((x) => x.toLowerCase() === v.toLowerCase())) return f;
      return { ...f, [key]: [...existing, v] };
    });
    if (kind === "interior") setInteriorBuf("");
    else setExteriorBuf("");
  };
  const removeFeature = (kind: "interior" | "exterior", value: string) => {
    setForm((f) => {
      const key = kind === "interior" ? "interior_features" : "exterior_features";
      return { ...f, [key]: f[key].filter((x) => x !== value) };
    });
  };

  // Pending file selected by the user before submit. When set, we
  // POST to the upload endpoint as multipart instead of a JSON
  // payload to /documents — same row shape lands either way.
  const [docFile, setDocFile] = useState<File | null>(null);

  // Pipeline stepper — direct-save on click rather than waiting for
  // the main Save button. Stage transitions are first-class events
  // (the work queue scans them), so a half-saved stage is worse
  // than no stage; we commit immediately.
  const [stagingStage, setStagingStage] = useState<string | null>(null);
  const setStage = async (stage: string | null) => {
    if (!property) return;
    setStagingStage(stage);
    try {
      const r = await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ transaction_stage: stage }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Failed to update stage");
      }
      await loadProperty();
    } catch (e: any) {
      alert(e.message || "Stage update failed");
    } finally {
      setStagingStage(null);
    }
  };

  const addDocument = async () => {
    setDocError(null);
    if (!docDraft.title.trim() && !docFile) {
      setDocError("Title or file is required");
      return;
    }
    setSavingDoc(true);
    try {
      let r: Response;
      if (docFile) {
        const fd = new FormData();
        fd.append("file", docFile);
        // Title falls back to the filename if the user left it blank.
        fd.append(
          "title",
          (docDraft.title.trim() || docFile.name.replace(/\.[^.]+$/, "")).slice(0, 200),
        );
        fd.append("doc_kind", docDraft.doc_kind);
        if (docDraft.expires_at) fd.append("expires_at", docDraft.expires_at);
        if (docDraft.notes.trim()) fd.append("notes", docDraft.notes.trim());
        r = await fetch(`/api/properties/${propertyId}/documents/upload`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
      } else {
        r = await fetch(`/api/properties/${propertyId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: docDraft.title.trim(),
            doc_kind: docDraft.doc_kind,
            external_url: docDraft.external_url.trim() || null,
            expires_at: docDraft.expires_at || null,
            notes: docDraft.notes.trim() || null,
          }),
        });
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Failed");
      }
      setDocDraft({
        title: "",
        doc_kind: "lease",
        external_url: "",
        expires_at: "",
        notes: "",
      });
      setDocFile(null);
      setDocFormOpen(false);
      await loadDocuments();
    } catch (e: any) {
      setDocError(e.message || "Failed to attach");
    } finally {
      setSavingDoc(false);
    }
  };

  // Open a stored file via short-lived signed URL. We do not embed
  // signed URLs in the list payload because they're sensitive and
  // expire — fetch on click is both safer and friendlier on caching.
  const openStoredFile = async (filePath: string) => {
    try {
      const r = await fetch(
        `/api/properties/${propertyId}/documents/upload?path=${encodeURIComponent(filePath)}`,
        { credentials: "include" },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Failed");
      }
      const j = await r.json();
      if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e.message || "Failed to open file");
    }
  };
  const removeDocument = async (docId: string) => {
    if (!confirm("Remove this document?")) return;
    const r = await fetch(`/api/properties/${propertyId}/documents/${docId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) await loadDocuments();
  };

  // expiry status — used to highlight rows in the documents table.
  const expiryClass = (iso: string | null): string => {
    if (!iso) return "text-[var(--ink-subtle)]";
    const now = Date.now();
    const exp = new Date(iso).getTime();
    const days = Math.floor((exp - now) / 86400_000);
    if (days < 0) return "text-[var(--danger)] font-medium";
    if (days <= 30) return "text-[var(--accent)] font-medium";
    return "text-[var(--ink-muted)]";
  };
  const expiryLabel = (iso: string | null): string => {
    if (!iso) return "—";
    const now = Date.now();
    const exp = new Date(iso).getTime();
    const days = Math.floor((exp - now) / 86400_000);
    if (days < 0) return `Expired ${Math.abs(days)}d ago`;
    if (days === 0) return "Expires today";
    if (days <= 60) return `In ${days}d`;
    return new Date(iso).toLocaleDateString();
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
        <div className="flex items-start justify-between gap-4 flex-wrap">
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
          <div className="pt-2">
            <ContextualAskPanel
              entityKind="property"
              entityId={property.id}
              entityLabel={
                property.address_line1 +
                (property.city ? `, ${property.city}` : "")
              }
            />
          </div>
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

        {/* Transaction pipeline — stepper. Each stage is clickable;
            clicking sets the stage immediately (the work queue scans
            stage_entered_at to flag stuck deals). */}
        <section className="card-flat p-6">
          <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
            <div>
              <div className="label-section mb-1">Pipeline</div>
              <h2 className="text-base font-semibold">Transaction stage</h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5 max-w-xl">
                Drift watches each stage and flags deals stuck longer than
                typical. {property.transaction_stage && property.stage_entered_at && (
                  <>
                    Currently in{" "}
                    <span className="text-[var(--ink)] mono uppercase">
                      {property.transaction_stage}
                    </span>{" "}
                    for{" "}
                    {Math.max(
                      0,
                      Math.floor(
                        (Date.now() -
                          new Date(property.stage_entered_at).getTime()) /
                          86400_000,
                      ),
                    )}
                    {" "}days.
                  </>
                )}
              </p>
            </div>
            {property.transaction_stage && (
              <button
                onClick={() => setStage(null)}
                className="text-[11px] text-[var(--ink-subtle)] hover:text-[var(--danger)] transition"
              >
                Clear stage
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                "listed",
                "showing",
                "offer",
                "pending",
                "closed",
              ] as const
            ).map((s, i, arr) => {
              const active = property.transaction_stage === s;
              const isPast = (() => {
                if (!property.transaction_stage) return false;
                const cur = arr.indexOf(property.transaction_stage as typeof arr[number]);
                return cur > -1 && i < cur;
              })();
              return (
                <div key={s} className="flex items-center">
                  <button
                    onClick={() => setStage(s)}
                    disabled={stagingStage !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-xs font-medium transition border"
                    style={{
                      background: active
                        ? "var(--ink)"
                        : isPast
                        ? "var(--canvas-subtle)"
                        : "transparent",
                      color: active
                        ? "var(--canvas)"
                        : isPast
                        ? "var(--ink)"
                        : "var(--ink-muted)",
                      borderColor: active ? "var(--ink)" : "var(--rule)",
                    }}
                  >
                    {stagingStage === s && (
                      <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                    )}
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                  {i < arr.length - 1 && (
                    <ChevronRight
                      className="w-3 h-3 mx-0.5"
                      strokeWidth={1.5}
                      style={{
                        color: isPast || active
                          ? "var(--ink)"
                          : "var(--ink-subtle)",
                      }}
                    />
                  )}
                </div>
              );
            })}
            <span className="mx-2 text-[var(--ink-subtle)] text-xs">·</span>
            {(["withdrawn", "expired"] as const).map((s) => {
              const active = property.transaction_stage === s;
              return (
                <button
                  key={s}
                  onClick={() => setStage(s)}
                  disabled={stagingStage !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-xs font-medium transition border"
                  style={{
                    background: active ? "var(--danger)" : "transparent",
                    color: active ? "var(--canvas)" : "var(--ink-muted)",
                    borderColor: active ? "var(--danger)" : "var(--rule)",
                  }}
                >
                  {stagingStage === s && (
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                  )}
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid md:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">
                Expected close date
              </div>
              <input
                value={form.expected_close_date_or_empty}
                onChange={(e) =>
                  setForm({
                    ...form,
                    expected_close_date_or_empty: e.target.value,
                  })
                }
                type="date"
                className={inputClass}
              />
            </label>
          </div>
        </section>

        {/* Description */}
        <section className="card-flat p-6">
          <div className="label-section mb-4">Description</div>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={5}
            placeholder="What's in the property — rooms, finishes, condition, recent renovations, neighbourhood notes."
            className={`${inputClass} resize-y`}
          />
        </section>

        {/* Features */}
        <section className="card-flat p-6">
          <div className="label-section mb-4">Features</div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-[var(--ink-muted)] mb-2">
                Interior
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.interior_features.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] bg-[var(--canvas-subtle)] border border-[var(--rule)] text-xs text-[var(--ink)]"
                  >
                    {f}
                    <button
                      onClick={() => removeFeature("interior", f)}
                      className="text-[var(--ink-subtle)] hover:text-[var(--danger)]"
                    >
                      <X className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={interiorBuf}
                onChange={(e) => setInteriorBuf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addFeature("interior", interiorBuf);
                  }
                }}
                onBlur={() => addFeature("interior", interiorBuf)}
                placeholder="hardwood floors, fireplace, in-unit laundry…"
                className={inputClass}
              />
            </div>
            <div>
              <div className="text-xs text-[var(--ink-muted)] mb-2">
                Exterior
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.exterior_features.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] bg-[var(--canvas-subtle)] border border-[var(--rule)] text-xs text-[var(--ink)]"
                  >
                    {f}
                    <button
                      onClick={() => removeFeature("exterior", f)}
                      className="text-[var(--ink-subtle)] hover:text-[var(--danger)]"
                    >
                      <X className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={exteriorBuf}
                onChange={(e) => setExteriorBuf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addFeature("exterior", exteriorBuf);
                  }
                }}
                onBlur={() => addFeature("exterior", exteriorBuf)}
                placeholder="fenced yard, pool, two-car garage…"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3 mt-5">
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">
                Year built
              </div>
              <input
                value={form.year_built}
                onChange={(e) => setForm({ ...form, year_built: e.target.value })}
                type="number"
                min="1700"
                max="2100"
                placeholder="e.g. 1998"
                className={inputClass}
              />
            </label>
            <label className="block">
              <div className="text-xs text-[var(--ink-muted)] mb-1">
                Lot size (sqft)
              </div>
              <input
                value={form.lot_size_sqft}
                onChange={(e) =>
                  setForm({ ...form, lot_size_sqft: e.target.value })
                }
                type="number"
                min="0"
                className={inputClass}
              />
            </label>
          </div>
        </section>

        {/* Lease — only meaningful for rentals, but always render so
            the field is reachable if the user mistakenly set the kind
            to something else and is now correcting course. */}
        {form.kind === "rental" && (
          <section className="card-flat p-6">
            <div className="label-section mb-4">Lease</div>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs text-[var(--ink-muted)] mb-1">
                  Term (months)
                </div>
                <input
                  value={form.lease_term_months}
                  onChange={(e) =>
                    setForm({ ...form, lease_term_months: e.target.value })
                  }
                  type="number"
                  min="0"
                  placeholder="e.g. 12"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <div className="text-xs text-[var(--ink-muted)] mb-1">
                  Monthly rent (USD)
                </div>
                <input
                  value={form.monthly_rent_dollars}
                  onChange={(e) =>
                    setForm({ ...form, monthly_rent_dollars: e.target.value })
                  }
                  type="number"
                  min="0"
                  step="50"
                  placeholder="e.g. 2500"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <div className="text-xs text-[var(--ink-muted)] mb-1">
                  Lease start
                </div>
                <input
                  value={form.lease_start_date}
                  onChange={(e) =>
                    setForm({ ...form, lease_start_date: e.target.value })
                  }
                  type="date"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <div className="text-xs text-[var(--ink-muted)] mb-1">
                  Lease end
                </div>
                <input
                  value={form.lease_end_date}
                  onChange={(e) =>
                    setForm({ ...form, lease_end_date: e.target.value })
                  }
                  type="date"
                  className={inputClass}
                />
              </label>
              <label className="block md:col-span-2">
                <div className="text-xs text-[var(--ink-muted)] mb-1">
                  Tenant
                </div>
                <select
                  value={form.tenant_contact_id}
                  onChange={(e) =>
                    setForm({ ...form, tenant_contact_id: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">— Pick a contact —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email || c.phone || c.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

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
                      <EntityAsk
                        kind="contact"
                        id={c.contact_id}
                        label={c.name || "(no name)"}
                      >
                        {c.name || "(no name)"}
                      </EntityAsk>
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

        {/* Documents — files / links attached to this property.
            Anything with expires_at flows into the renewal-reminder
            cron, which drops a draft reminder ahead of expiry. */}
        <section className="card-flat p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="label-section mb-1">Documents</div>
              <h2 className="text-base font-semibold">Attached documents</h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5 max-w-xl">
                Lease, inspection, disclosure, deed, HOA, insurance — anything
                tied to this address. Documents with an expiry date trigger
                automatic renewal reminders.
              </p>
            </div>
            <button
              onClick={() => setDocFormOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
            >
              {docFormOpen ? (
                <>
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} /> Cancel
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Attach
                </>
              )}
            </button>
          </div>

          {docFormOpen && (
            <div className="mb-5 border border-[var(--rule)] rounded-[4px] p-4 bg-[var(--canvas-subtle)] space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <input
                  value={docDraft.title}
                  onChange={(e) =>
                    setDocDraft({ ...docDraft, title: e.target.value })
                  }
                  placeholder="Title — e.g. 2026 Lease — Smith"
                  className={inputClass}
                />
                <select
                  value={docDraft.doc_kind}
                  onChange={(e) =>
                    setDocDraft({ ...docDraft, doc_kind: e.target.value })
                  }
                  className={inputClass}
                >
                  {DOC_KIND_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <input
                  value={docDraft.external_url}
                  onChange={(e) =>
                    setDocDraft({ ...docDraft, external_url: e.target.value })
                  }
                  placeholder="Or paste a link (Google Drive, MLS…)"
                  className={inputClass}
                  disabled={!!docFile}
                />
                <label className="block">
                  <div className="text-[11px] text-[var(--ink-muted)] mb-1">
                    Expires
                  </div>
                  <input
                    value={docDraft.expires_at}
                    onChange={(e) =>
                      setDocDraft({ ...docDraft, expires_at: e.target.value })
                    }
                    type="date"
                    className={inputClass}
                  />
                </label>
              </div>

              {/* File picker — drag-drop or browse. When a file is
                  selected, the link field disables (one OR the other,
                  not both, to avoid ambiguity about which "wins"). */}
              <div>
                <div className="text-[11px] text-[var(--ink-muted)] mb-1">
                  Upload a file
                </div>
                {docFile ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-xs">
                    <FileText
                      className="w-3.5 h-3.5 text-[var(--ink-muted)]"
                      strokeWidth={1.5}
                    />
                    <span className="flex-1 truncate text-[var(--ink)]">
                      {docFile.name}
                    </span>
                    <span className="mono text-[10px] text-[var(--ink-subtle)]">
                      {(docFile.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      onClick={() => setDocFile(null)}
                      className="text-[var(--ink-subtle)] hover:text-[var(--danger)]"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex items-center justify-center gap-2 py-3 rounded-[4px] border border-dashed border-[var(--rule-strong)] hover:bg-[var(--canvas)] text-xs text-[var(--ink-muted)] cursor-pointer transition"
                    onDragOver={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLLabelElement).style.borderColor =
                        "var(--ink)";
                    }}
                    onDragLeave={(e) => {
                      (e.currentTarget as HTMLLabelElement).style.borderColor =
                        "var(--rule-strong)";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLLabelElement).style.borderColor =
                        "var(--rule-strong)";
                      const f = e.dataTransfer.files?.[0];
                      if (f) setDocFile(f);
                    }}
                  >
                    <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>Drag a file here, or click to browse</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.heic,.webp,.doc,.docx,.txt,.md"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setDocFile(f);
                      }}
                    />
                  </label>
                )}
              </div>

              <textarea
                value={docDraft.notes}
                onChange={(e) =>
                  setDocDraft({ ...docDraft, notes: e.target.value })
                }
                rows={2}
                placeholder="Notes (optional)"
                className={`${inputClass} resize-y`}
              />
              {docError && (
                <p className="text-xs text-[var(--danger)]">{docError}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={addDocument}
                  disabled={savingDoc || (!docDraft.title.trim() && !docFile)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-xs font-semibold transition disabled:opacity-40"
                >
                  {savingDoc ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  ) : docFile ? (
                    <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
                  ) : (
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                  {docFile ? "Upload" : "Attach"}
                </button>
              </div>
            </div>
          )}

          {documents.length === 0 ? (
            <p className="text-xs text-[var(--ink-subtle)]">
              No documents attached yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="py-3 flex items-center gap-3"
                >
                  <FileText
                    className="w-4 h-4 text-[var(--ink-subtle)] shrink-0"
                    strokeWidth={1.5}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--ink)] truncate">
                      <EntityAsk
                        kind="document"
                        id={d.id}
                        label={d.title}
                      >
                        {d.title}
                      </EntityAsk>
                    </div>
                    <div className="text-[11px] text-[var(--ink-subtle)] flex items-center gap-3 mt-0.5">
                      <span className="mono uppercase tracking-wider">
                        {d.doc_kind.replace("_", " ")}
                      </span>
                      {d.expires_at && (
                        <span
                          className={`inline-flex items-center gap-1 ${expiryClass(d.expires_at)}`}
                        >
                          <CalendarClock className="w-3 h-3" strokeWidth={1.5} />
                          {expiryLabel(d.expires_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  {d.file_path && (
                    <button
                      onClick={() => openStoredFile(d.file_path!)}
                      className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                      title="Open uploaded file"
                    >
                      <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                  {d.external_url && (
                    <a
                      href={d.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                      title="Open link"
                    >
                      <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </a>
                  )}
                  <button
                    onClick={() => removeDocument(d.id)}
                    className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                    title="Remove document"
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
