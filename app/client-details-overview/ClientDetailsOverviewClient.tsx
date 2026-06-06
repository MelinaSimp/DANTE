"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  X,
  Check,
  LayoutDashboard,
  Upload,
  Trash2,
  FileStack,
  UserPlus,
  Pencil,
  FileText,
  Phone,
  Download,
  Share2,
  Archive,
  Inbox,
  ShieldAlert,
} from "lucide-react";
import dynamic from "next/dynamic";
import { formatPhoneToE164 } from "@/lib/validation";
import { supabase } from "@/lib/supabase/client";
import AddNoteForm from "@/components/notes/AddNoteForm";
import CallAuditView, {
  type StructuredSummary,
  type ComplianceFlag,
} from "@/components/call/CallAuditView";
import type { Annotation } from "@/components/documents/PdfViewerWithAnnotations";
import DocumentExtractionPanel from "@/components/documents/DocumentExtractionPanel";
import HoldingsSection from "@/components/contacts/HoldingsSection";
import PlanningProfileEditor from "@/components/contacts/PlanningProfileEditor";

const PdfViewerWithAnnotations = dynamic(
  () => import("@/components/documents/PdfViewerWithAnnotations"),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-[var(--ink-subtle)] text-sm">Loading PDF viewer…</div> }
);
const DocumentSummaryChat = dynamic(
  () => import("@/components/documents/DocumentSummaryChat"),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-4 text-[var(--ink-subtle)] text-sm">Loading…</div> }
);
const ContactImporter = dynamic(
  () => import("@/components/contacts/ContactImporter"),
  { ssr: false }
);
import ConfirmationModal from "@/components/frontend/ConfirmationModal";
import { reportError } from "@/lib/report-error";
import DanteNoticed from "@/components/dante/DanteNoticed";
import EntityAsk from "@/components/dante/EntityAsk";
import { usePageContext } from "@/components/dante/PageContext";

type Contact = { id: string; name: string; phone?: string; email?: string };

type View = "select" | "overview";
type SelectedEntity = { type: "client"; id: string; name: string } | null;

type ClientTemplate = {
  id: string;
  name: string;
  document_id: string;
  annotated_page_numbers: number[];
  created_at: string;
};

type ClientNote = {
  id: string;
  contact_id: string;
  body: string;
  created_at: string;
};

function formatTime() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `Today ${(h % 12) || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

interface ClientDetailsOverviewClientProps {
  initialContacts?: Contact[];
  initialContactId?: string | null;
  panelMode?: boolean;
  onClose?: () => void;
}

export default function ClientDetailsOverviewClient({
  initialContacts = [],
  initialContactId = null,
  panelMode = false,
  onClose,
}: ClientDetailsOverviewClientProps) {
  const router = useRouter();
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (panelMode) return;
    fetch("/api/agents", { credentials: "include" })
      .then((r) => r.json())
      .then((agents) => { if (agents?.length > 0) setAgentId(agents[0].id); })
      .catch(reportError("ClientDetailsOverview: load agents"));
  }, [panelMode]);

  const [view, setView] = useState<View>("select");
  const [selected, setSelected] = useState<SelectedEntity>(null);
  const [activeSection, setActiveSection] = useState("account-overview");

  // Register page context with the AgentDock. When a contact is
  // selected, scope the dock to that contact (questions hit
  // /api/dante/ask with context_contact_id set). Otherwise, fall
  // back to a generic "Clients" page-level context.
  usePageContext(
    selected?.type === "client" && (selected as { name?: string }).name
      ? {
          title: (selected as { name: string }).name,
          subtitle: "Client",
          entity: {
            kind: "contact",
            id: selected.id,
            label: (selected as { name: string }).name,
          },
        }
      : { title: "Clients" },
  );
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [document, setDocument] = useState<{
    id: string;
    file_name: string;
    url: string;
    extracted_text?: string;
  } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // "Save as template?" flow
  const [templateAskDismissed, setTemplateAskDismissed] = useState(false);
  const [showTemplateNameInput, setShowTemplateNameInput] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savedTemplateName, setSavedTemplateName] = useState<string | null>(null);
  // Templates list + "Use this template" flow
  const [templates, setTemplates] = useState<ClientTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ClientTemplate | null>(null);
  // Notes list for the selected client (hand-written + AI call-recording notes)
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  // Audit view state — opens when the user clicks "View audit" on a call note.
  type AuditData = {
    id: string;
    contact_id: string;
    transcript: string | null;
    transcript_segments:
      | { id: number; start: number; end: number; text: string }[]
      | null;
    summary_structured: StructuredSummary | null;
    summary: string | null;
    engagement: {
      overall_interest: number;
      topics: Array<{
        topic: string;
        interest: "high" | "medium" | "low";
        evidence: string;
        segment_ids: number[];
      }>;
    } | null;
    created_at: string;
    note_id: string | null;
  };
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [auditFlags, setAuditFlags] = useState<ComplianceFlag[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);

  const openAuditForNote = useCallback(async (noteId: string) => {
    setAuditOpen(true);
    setAuditLoading(true);
    setAuditError(null);
    setAuditData(null);
    setAuditFlags([]);
    try {
      const res = await fetch(
        `/api/calls/audit?noteId=${encodeURIComponent(noteId)}`,
        { credentials: "include" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuditError(json.error || "Failed to load audit");
      } else {
        setAuditData(json.audit as AuditData);
        setAuditFlags((json.flags as ComplianceFlag[]) || []);
      }
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const handleFlagAction = useCallback(
    async (flagId: string, action: "approved" | "dismissed") => {
      // Optimistic update — the modal's UI is already "busy" via its
      // own pendingFlagAction state. We roll back on error.
      const prev = auditFlags;
      setAuditFlags((fs) =>
        fs.map((f) => (f.id === flagId ? { ...f, status: action } : f))
      );
      try {
        const r = await fetch(
          `/api/compliance/flags/${encodeURIComponent(flagId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action }),
          }
        );
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        // Dismissed flags shouldn't linger in the modal — they're
        // cleared from the reviewer view. Approved stay with the
        // "approved" chip so the audit trail is visible.
        if (action === "dismissed") {
          setAuditFlags((fs) => fs.filter((f) => f.id !== flagId));
        }
      } catch {
        setAuditFlags(prev);
      }
    },
    [auditFlags]
  );
  const [useTemplateMode, setUseTemplateMode] = useState(false);
  const [documentToAnalyzeUrl, setDocumentToAnalyzeUrl] = useState<string | null>(null);
  const [documentToAnalyzeFileName, setDocumentToAnalyzeFileName] = useState<string | null>(null);
  const [uploadingToAnalyze, setUploadingToAnalyze] = useState(false);
  const [showAnalyzePdfPreview, setShowAnalyzePdfPreview] = useState(false);
  // Client list (synced from server, append on add)
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  // Add client modal
  const [showAddClient, setShowAddClient] = useState(false);
  // CSV importer modal
  const [showImporter, setShowImporter] = useState(false);
  const [addClientFirstName, setAddClientFirstName] = useState("");
  const [addClientLastName, setAddClientLastName] = useState("");
  const [addClientPhone, setAddClientPhone] = useState("");
  const [addClientEmail, setAddClientEmail] = useState("");
  const [addClientLoading, setAddClientLoading] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);
  // Edit client modal
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Delete client
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  // Toast notifications
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const showToast = (type: "success" | "error", message: string) => {
    setToastMsg({ type, message });
    setTimeout(() => setToastMsg(null), type === "error" ? 5000 : 3000);
  };
  // Edit template modal
  const [editingTemplate, setEditingTemplate] = useState<ClientTemplate | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateLoading, setEditTemplateLoading] = useState(false);
  const [editTemplateError, setEditTemplateError] = useState<string | null>(null);
  // Edit template annotations mode (show banner + Done)
  const [editingTemplateAnnotations, setEditingTemplateAnnotations] = useState<ClientTemplate | null>(null);
  // When template's document differs from current: fetch and show in overlay
  const [templateDocForEdit, setTemplateDocForEdit] = useState<{ id: string; file_name: string; url: string } | null>(null);
  const [templateAnnotationsForEdit, setTemplateAnnotationsForEdit] = useState<Annotation[]>([]);

  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  useEffect(() => {
    if (initialContactId && contacts.length > 0) {
      const contact = contacts.find((c) => c.id === initialContactId);
      if (contact) {
        setSelected({ type: "client", id: contact.id, name: contact.name });
        setView("overview");
        setActiveSection("account-overview");
      }
    }
  }, [initialContactId, contacts]);

  const loadDocument = useCallback(async (contactId: string) => {
    const res = await fetch(`/api/documents?contactId=${contactId}`, { credentials: "include" });
    const data = await res.json();
    if (data.document) {
      setDocument({
        id: data.document.id,
        file_name: data.document.file_name,
        url: data.document.url,
        extracted_text: data.document.extracted_text,
      });
      const annRes = await fetch(`/api/documents/annotations?documentId=${data.document.id}`, {
        credentials: "include",
      });
      const annData = await annRes.json();
      setAnnotations(annData.annotations ?? []);
    } else {
      setDocument(null);
      setAnnotations([]);
    }
  }, []);

  const loadTemplates = useCallback(async (contactId: string) => {
    const res = await fetch(`/api/client-templates?contactId=${contactId}`);
    const data = await res.json().catch(() => ({}));
    setTemplates(data.templates ?? []);
  }, []);

  // RLS on `notes` is already scoped to the user's workspace, so a plain
  // select by contact_id is safe from the client.
  const loadNotes = useCallback(async (contactId: string) => {
    setNotesLoading(true);
    try {
      const { data } = await supabase
        .from("notes")
        .select("id, contact_id, body, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      setClientNotes((data as ClientNote[]) ?? []);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    setUploadError(null);
    if (selected?.type === "client") {
      loadDocument(selected.id);
      loadTemplates(selected.id);
      loadNotes(selected.id);
    } else {
      setDocument(null);
      setAnnotations([]);
      setTemplates([]);
      setClientNotes([]);
    }
    setSelectedTemplate(null);
    setUseTemplateMode(false);
    setDocumentToAnalyzeUrl(null);
    setEditingTemplateAnnotations(null);
    setTemplateDocForEdit(null);
    setTemplateAnnotationsForEdit([]);
  }, [selected?.type, selected?.id ?? "", loadDocument, loadTemplates, loadNotes]);

  // Reset template prompt when document changes so we can ask again for the new doc
  useEffect(() => {
    setTemplateAskDismissed(false);
    setShowTemplateNameInput(false);
    setTemplateName("");
    setSavedTemplateName(null);
  }, [document?.id]);

  const handleSelectClient = (client: Contact) => {
    setSelected({
      type: "client",
      id: client.id,
      name: client.name,
    });
    setView("overview");
  };

  const handleGoBack = () => {
    setView("select");
    setSelected(null);
  };

  const handleAddClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddClientError(null);
    const firstName = addClientFirstName.trim();
    const lastName = addClientLastName.trim();
    const phoneRaw = addClientPhone.trim();
    const email = addClientEmail.trim();
    if (!firstName || !lastName || !phoneRaw || !email) {
      setAddClientError("First name, last name, phone number, and email are required.");
      return;
    }
    const phone = phoneRaw.startsWith("+") ? phoneRaw : formatPhoneToE164(phoneRaw);
    setAddClientLoading(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          phone,
          email,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddClientError(data.error || data.details?.join?.(" ") || "Failed to add client");
        return;
      }
      setContacts((prev) => [...prev, { id: data.id, name: data.name, phone: data.phone, email: data.email }]);
      setShowAddClient(false);
      setAddClientFirstName("");
      setAddClientLastName("");
      setAddClientPhone("");
      setAddClientEmail("");
    } catch (err) {
      setAddClientError(err instanceof Error ? err.message : "Failed to add client");
    } finally {
      setAddClientLoading(false);
    }
  };

  const openEditModal = (client: Contact) => {
    const parts = (client.name || "").trim().split(/\s+/);
    setEditingContact(client);
    setEditFirstName(parts[0] ?? "");
    setEditLastName(parts.slice(1).join(" ") ?? "");
    setEditPhone(client.phone ?? "");
    setEditEmail(client.email ?? "");
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    setEditError(null);
    const firstName = editFirstName.trim();
    const lastName = editLastName.trim();
    const phoneRaw = editPhone.trim();
    const email = editEmail.trim();
    if (!firstName || !lastName || !phoneRaw || !email) {
      setEditError("First name, last name, phone number, and email are required.");
      return;
    }
    const phone = phoneRaw.startsWith("+") ? phoneRaw : formatPhoneToE164(phoneRaw);
    setEditLoading(true);
    try {
      const res = await fetch(`/api/contacts/${editingContact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          phone,
          email,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data.error || "Failed to update client");
        return;
      }
      setContacts((prev) =>
        prev.map((c) =>
          c.id === editingContact.id
            ? { id: c.id, name: data.name, phone: data.phone, email: data.email }
            : c
        )
      );
      setEditingContact(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update client");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteClient = (client: Contact) => {
    setConfirmModal({
      title: "Delete Client",
      message: `Delete ${client.name}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setDeletingContactId(client.id);
        try {
          const res = await fetch(`/api/contacts/${client.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete");
          setContacts((prev) => prev.filter((c) => c.id !== client.id));
          if (selected?.id === client.id) {
            setSelected(null);
            setView("select");
          }
        } catch (err) {
          showToast("error", "Failed to delete client.");
        } finally {
          setDeletingContactId(null);
        }
      },
    });
  };

  const openEditTemplateModal = (t: ClientTemplate) => {
    setEditingTemplate(t);
    setEditTemplateName(t.name);
    setEditTemplateError(null);
  };

  const handleEditTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || selected?.type !== "client") return;
    setEditTemplateError(null);
    const name = editTemplateName.trim();
    if (!name) {
      setEditTemplateError("Template name is required.");
      return;
    }
    setEditTemplateLoading(true);
    try {
      const res = await fetch(`/api/client-templates/${editingTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update template");
      setTemplates((prev) =>
        prev.map((p) => (p.id === editingTemplate.id ? { ...p, name } : p))
      );
      if (selectedTemplate?.id === editingTemplate.id) {
        setSelectedTemplate({ ...selectedTemplate, name });
      }
      setEditingTemplate(null);
    } catch (err) {
      setEditTemplateError(err instanceof Error ? err.message : "Failed to update template");
    } finally {
      setEditTemplateLoading(false);
    }
  };

  const handleDeleteTemplate = (t: ClientTemplate) => {
    setConfirmModal({
      title: "Delete Template",
      message: `Delete template "${t.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch(`/api/client-templates/${t.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete");
          setTemplates((prev) => prev.filter((p) => p.id !== t.id));
          if (selectedTemplate?.id === t.id) {
            setSelectedTemplate(null);
            setUseTemplateMode(false);
          }
        } catch (err) {
          showToast("error", err instanceof Error ? err.message : "Failed to delete template.");
        }
      },
    });
  };

  const openEditTemplateAnnotations = async (t: ClientTemplate) => {
    setEditingTemplate(null);
    setUseTemplateMode(false);
    if (t.document_id === document?.id) {
      if (selected?.type === "client") await loadDocument(selected.id);
      setEditingTemplateAnnotations(t);
      setTemplateDocForEdit(null);
      setTemplateAnnotationsForEdit([]);
      return;
    }
    try {
      const docRes = await fetch(`/api/documents/${t.document_id}`, { credentials: "include" });
      const docData = await docRes.json().catch(() => ({}));
      if (!docRes.ok || !docData.url) {
        showToast("error", "Could not load the template's document. It may have been replaced or deleted.");
        return;
      }
      const annRes = await fetch(`/api/documents/annotations?documentId=${t.document_id}`, {
        credentials: "include",
      });
      const annData = await annRes.json().catch(() => ({}));
      setTemplateDocForEdit({ id: docData.id, file_name: docData.file_name || "Template PDF", url: docData.url });
      setTemplateAnnotationsForEdit(annData.annotations ?? []);
      setEditingTemplateAnnotations(t);
    } catch (err) {
      showToast("error", "Failed to load template document.");
    }
  };

  const handleDoneEditingTemplateAnnotations = async () => {
    const t = editingTemplateAnnotations;
    if (!t) return;
    const anns = templateDocForEdit ? templateAnnotationsForEdit : annotations;
    const pageNumbers = [...new Set(anns.map((a) => a.page_number))].sort((a, b) => a - b);
    try {
      const res = await fetch(`/api/client-templates/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotatedPageNumbers: pageNumbers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `Failed to update (${res.status})`;
        console.error("[Template] Update failed:", res.status, data);
        throw new Error(msg);
      }
      setTemplates((prev) =>
        prev.map((p) => (p.id === t.id ? { ...p, annotated_page_numbers: pageNumbers } : p))
      );
      if (selectedTemplate?.id === t.id) {
        setSelectedTemplate({ ...selectedTemplate, annotated_page_numbers: pageNumbers });
      }
      setEditingTemplateAnnotations(null);
      setTemplateDocForEdit(null);
      setTemplateAnnotationsForEdit([]);
      if (selected?.type === "client") await loadTemplates(selected.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update template.";
      console.error("[Template] Done failed:", err);
      showToast("error", msg);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected || selected.type !== "client") return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contactId", selected.id);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      await loadDocument(selected.id);
      setUploadError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!document || !selected || selected.type !== "client" || !templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const annotatedPageNumbers = [...new Set(annotations.map((a) => a.page_number))].sort((a, b) => a - b);
      const res = await fetch("/api/client-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selected.id,
          documentId: document.id,
          name: templateName.trim(),
          annotatedPageNumbers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save template");
      setSavedTemplateName(templateName.trim());
      setShowTemplateNameInput(false);
      setTemplateName("");
      if (selected?.type === "client") loadTemplates(selected.id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!document || !selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setDocument(null);
      setAnnotations([]);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // Flat icon wrapper — no halo, keeps the same props shape for callers
  const IconHalo = ({ children, className = "" }: { children: React.ReactNode; className?: string; shape?: "circle" | "square" }) => (
    <div className={`relative ${className}`}>{children}</div>
  );

  // ——— Clients list (Harvey-style dense table) ———
  if (view === "select") {
    const query = clientSearchQuery.trim().toLowerCase();
    const filteredContacts = query
      ? contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(query) ||
            (c.phone ?? "").toLowerCase().includes(query) ||
            (c.email ?? "").toLowerCase().includes(query)
        )
      : contacts;

    return (
      <div className={panelMode ? "bg-[var(--canvas)] text-[var(--ink)]" : "min-h-[calc(100vh-4rem)] bg-[var(--canvas)] text-[var(--ink)]"}>
        <div className={panelMode ? "mx-auto max-w-6xl px-6 py-8" : "mx-auto max-w-6xl px-6 md:px-10 py-12"}>
          {/* Back to dashboard — only in standalone (non-panel) mode.
              Panel mode is embedded inside other surfaces that already have
              their own navigation. */}
          {!panelMode && (
            <Link
              href="/home"
              className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              Dashboard
            </Link>
          )}

          {/* Editorial header */}
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="label-section mb-2">Workspace</div>
              <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)]">Clients</h1>
              <p className="prose-body text-[var(--ink-muted)] mt-2">
                {contacts.length} {contacts.length === 1 ? "household" : "households"} on file. Click a row to open.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImporter(true)}
                className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2 text-sm font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)] transition"
              >
                <Upload className="h-4 w-4" strokeWidth={1.5} />
                Import CSV
              </button>
              <button
                type="button"
                onClick={() => { setShowAddClient(true); setAddClientError(null); }}
                className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 transition"
              >
                <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                Add client
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              value={clientSearchQuery}
              onChange={(e) => setClientSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or email…"
              className="w-full max-w-sm rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition"
            />
          </div>

          {/* Dense table */}
          {contacts.length === 0 ? (
            <div className="border-t border-b border-[var(--rule)] py-16 text-center">
              <p className="text-sm text-[var(--ink-muted)] italic">
                No clients yet. Click &ldquo;Add client&rdquo; to add your first household.
              </p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="border-t border-b border-[var(--rule)] py-10 text-center">
              <p className="text-sm text-[var(--ink-muted)] italic">
                No clients match &ldquo;{clientSearchQuery}&rdquo;.
              </p>
            </div>
          ) : (
            <div className="border-t border-b border-[var(--rule)]">
              {/* Column header row */}
              <div className="grid grid-cols-[1.5fr_1fr_1.5fr_auto] gap-4 px-4 py-2.5 border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                <div className="label-section">Name</div>
                <div className="label-section">Phone</div>
                <div className="label-section">Email</div>
                <div className="label-section w-20 text-right">Actions</div>
              </div>
              {filteredContacts.map((client) => (
                <div
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectClient(client)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectClient(client);
                    }
                  }}
                  className="group grid grid-cols-[1.5fr_1fr_1.5fr_auto] gap-4 px-4 py-3 border-b border-[var(--rule)] last:border-b-0 cursor-pointer transition hover:bg-[var(--canvas-subtle)] focus:bg-[var(--canvas-subtle)] focus:outline-none"
                >
                  <div className="text-[15px] font-medium text-[var(--ink)] truncate">{client.name}</div>
                  <div className="text-sm mono text-[var(--ink-muted)] truncate">
                    {client.phone || <span className="text-[var(--ink-subtle)]">—</span>}
                  </div>
                  <div className="text-sm text-[var(--ink-muted)] truncate">
                    {client.email || <span className="text-[var(--ink-subtle)]">—</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 w-20 justify-end" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openEditModal(client); }}
                      className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] opacity-0 group-hover:opacity-100 transition"
                      title="Edit client"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteClient(client); }}
                      disabled={deletingContactId === client.id}
                      className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:opacity-30 opacity-0 group-hover:opacity-100 transition"
                      title="Delete client"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CSV importer modal */}
          {showImporter && (
            <ContactImporter
              onClose={() => setShowImporter(false)}
              onImported={async () => {
                try {
                  const res = await fetch("/api/contacts");
                  if (res.ok) {
                    const rows = await res.json();
                    setContacts(rows);
                  }
                } catch {
                  // Non-fatal — user can refresh the page.
                }
              }}
            />
          )}

          {/* Add client modal */}
          {showAddClient && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !addClientLoading && setShowAddClient(false)}>
              <div className="bg-[var(--canvas)] rounded-[6px] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-[var(--ink)]">Add client</h2>
                  <button type="button" onClick={() => !addClientLoading && setShowAddClient(false)} className="p-1 rounded-[4px] hover:bg-[var(--canvas-subtle)]">
                    <X className="h-5 w-5 text-[var(--ink-muted)]" />
                  </button>
                </div>
                <p className="text-sm text-[var(--ink-muted)] mb-4">All fields are required. Phone can include country code (e.g. +1 216 509 9657).</p>
                <form onSubmit={handleAddClientSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-1">First name</label>
                    <input
                      type="text"
                      value={addClientFirstName}
                      onChange={(e) => setAddClientFirstName(e.target.value)}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      placeholder="Jane"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-1">Last name</label>
                    <input
                      type="text"
                      value={addClientLastName}
                      onChange={(e) => setAddClientLastName(e.target.value)}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      placeholder="Doe"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-1">Phone number</label>
                    <input
                      type="tel"
                      value={addClientPhone}
                      onChange={(e) => setAddClientPhone(e.target.value)}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      placeholder="+1 216 509 9657"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-1">Email</label>
                    <input
                      type="email"
                      value={addClientEmail}
                      onChange={(e) => setAddClientEmail(e.target.value)}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      placeholder="jane@example.com"
                      required
                    />
                  </div>
                  {addClientError && (
                    <p className="text-sm text-[var(--danger)]">{addClientError}</p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => !addClientLoading && setShowAddClient(false)}
                      className="flex-1 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addClientLoading}
                      className="flex-1 rounded-[4px] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--accent)]/90 disabled:opacity-60"
                    >
                      {addClientLoading ? "Adding…" : "Add client"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit client modal */}
          {editingContact && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !editLoading && setEditingContact(null)}>
              <div className="bg-[var(--canvas)] rounded-[6px] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-[var(--ink)]">Edit client</h2>
                  <button type="button" onClick={() => !editLoading && setEditingContact(null)} className="p-1 rounded-[4px] hover:bg-[var(--canvas-subtle)]">
                    <X className="h-5 w-5 text-[var(--ink-muted)]" />
                  </button>
                </div>
                <p className="text-sm text-[var(--ink-muted)] mb-4">Update client details. All fields are required.</p>
                <form onSubmit={handleEditSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-1">First name</label>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-1">Last name</label>
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-1">Phone number</label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-1">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      required
                    />
                  </div>
                  {editError && (
                    <p className="text-sm text-[var(--danger)]">{editError}</p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => !editLoading && setEditingContact(null)}
                      className="flex-1 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={editLoading}
                      className="flex-1 rounded-[4px] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--accent)]/90 disabled:opacity-60"
                    >
                      {editLoading ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Confirmation Modal (for select view) */}
          {confirmModal && (
            <ConfirmationModal
              isOpen={!!confirmModal}
              onCancel={() => setConfirmModal(null)}
              onConfirm={confirmModal.onConfirm}
              title={confirmModal.title}
              message={confirmModal.message}
              variant="danger"
            />
          )}

          {/* Toast (for select view) */}
          {toastMsg && (
            <div className={`fixed top-4 right-4 z-[100] max-w-sm w-full rounded-[6px] border p-4 flex items-start gap-3 ${
              toastMsg.type === "error" ? "bg-[var(--danger)] border-[var(--danger)]/30 text-[var(--canvas)]" : "bg-[var(--verified)] border-[var(--verified)]/30 text-[var(--canvas)]"
            }`}>
              <span className="text-sm font-medium flex-1">{toastMsg.message}</span>
              <button onClick={() => setToastMsg(null)} className="flex-shrink-0 hover:bg-[var(--canvas)]/20 rounded p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ——— Overview page (sidebar + main content with bars) ———
  const displayName = selected?.name ?? "Client";

  return (
    <div className={panelMode ? "flex bg-[var(--canvas)] text-[var(--ink)] h-full" : "min-h-[calc(100vh-4rem)] flex bg-[var(--canvas)] text-[var(--ink)]"}>
      {/* Main content — no left rail. The page is one vertical scroll; a
          sidebar of anchor links to the five sections on it would be
          redundant. Back-to-dashboard + client label live in the top bar. */}
      <div className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--rule)] bg-[var(--canvas)] px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {!panelMode && (
              <Link
                href="/home"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition shrink-0"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                Dashboard
              </Link>
            )}
            {!panelMode && <span className="text-[var(--ink-subtle)]">·</span>}
            <span className="text-lg font-semibold text-[var(--ink)] truncate">
              {displayName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--ink-muted)]">{formatTime()}</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setActionsOpen(!actionsOpen)}
                className="flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
              >
                Actions <ChevronDown className={`h-4 w-4 transition-transform ${actionsOpen ? "rotate-180" : ""}`} />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] z-20 py-1" onMouseLeave={() => setActionsOpen(false)}>
                  <button
                    onClick={() => {
                      if (selected?.type === "client") {
                        const data = { name: selected.name, document: document ? { name: document.file_name, url: document.url } : null };
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = Object.assign(window.document.createElement("a"), { href: url, download: `${selected.name}-export.json` });
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                  >
                    <Download className="h-4 w-4" /> Export Data
                  </button>
                  <button
                    onClick={() => {
                      if (selected?.type === "client" && typeof navigator !== "undefined") {
                        navigator.clipboard.writeText(`${window.location.origin}/contacts?contactId=${selected.id}`);
                      }
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                  >
                    <Share2 className="h-4 w-4" /> Copy Link
                  </button>
                </div>
              )}
            </div>
            {panelMode ? (
              <button
                type="button"
                onClick={handleGoBack}
                className="rounded-[4px] p-2 text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)]"
                aria-label="Back to contacts"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <Link
                href="/contacts"
                className="rounded-[4px] p-2 text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="mx-6 my-8 max-w-4xl space-y-10">
          {/* Overview section */}
          <section id="overview" className="scroll-mt-24">
            <div className="label-section mb-2">Overview</div>
            <h2 className="heading-display text-3xl text-[var(--ink)] mb-3">
              {selected?.type === "client" && selected.id ? (
                <EntityAsk
                  kind="contact"
                  id={selected.id}
                  label={displayName}
                >
                  {displayName}
                </EntityAsk>
              ) : (
                displayName
              )}
            </h2>
            <p className="prose-body text-[var(--ink-muted)]">
              {document
                ? `${templates.length} template${templates.length !== 1 ? "s" : ""} available, one primary document on file.`
                : `No documents uploaded yet. Upload a PDF below to start building templates.`}
            </p>
          </section>

          {/* What Dante/Vergil noticed about this contact — only
              renders when there's an active signal. The detail page
              becomes the surface where the assistant explains what
              they flagged about this person. */}
          {selected?.type === "client" && selected.id && (
            <DanteNoticed kind="contact" id={selected.id} prominent />
          )}

          {/* Planning profile — DOB, spouse DOB, state, planning
              subject flag. Powers the analyzers on /planning. */}
          {selected?.type === "client" && selected.id && (
            <section id="planning-profile" className="scroll-mt-24">
              <PlanningProfileEditor contactId={selected.id} />
            </section>
          )}

          {/* Holdings — accounts, holdings, insurance, beneficiaries
              aggregated from parsed documents. Renders an empty state
              if nothing has been extracted yet, so it self-onboards. */}
          {selected?.type === "client" && selected.id && (
            <section id="holdings" className="scroll-mt-24">
              <HoldingsSection contactId={selected.id} />
            </section>
          )}

          {/* Documents section — combines templates and uploads */}
          <section id="documents" className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-4">
              <span className="label-section">Documents</span>
              <FileStack className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
            </div>
            {activeSection === "account-overview" && (
              <div className="space-y-8">
                {/* Templates at top */}
                <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-3">Templates</h3>
                  {selected?.type !== "client" ? (
                    <p className="text-sm text-[var(--ink-muted)]">Select a client to view and use templates.</p>
                  ) : templates.length > 0 ? (
                    <div className="space-y-2">
                      {templates.map((t) => (
                        <div
                          key={t.id}
                          className={`rounded-[4px] border p-2 text-sm cursor-pointer transition ${
                            selectedTemplate?.id === t.id
                              ? "border-[var(--ink)] bg-[var(--canvas-subtle)]"
                              : "border-[var(--rule)] bg-[var(--canvas-subtle)] hover:bg-[var(--canvas-subtle)]"
                          }`}
                          onClick={() => setSelectedTemplate(selectedTemplate?.id === t.id ? null : t)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileStack className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
                              <span className="font-medium text-[var(--ink)] truncate">{t.name}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => openEditTemplateModal(t)}
                                className="rounded p-1 text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)]"
                                title="Edit template"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTemplate(t)}
                                className="rounded p-1 text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                                title="Delete template"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {selectedTemplate?.id === t.id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUseTemplateMode(true);
                              }}
                              className="mt-2 w-full rounded-[4px] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90"
                            >
                              Use this template
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--ink-muted)] space-y-2">
                      <p>No templates yet. Templates let you extract the same fields from any document with matching structure.</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-xs">
                        <li>Upload a PDF below</li>
                        <li>Highlight, comment on, or mark tables in the parts you want</li>
                        <li>Hit <span className="font-medium text-[var(--ink)]">Save as template</span> and give it a name</li>
                      </ol>
                    </div>
                  )}
                </div>

                {/* Document upload / viewer + annotations + generate */}
                <div className="mt-8">
                {selected?.type !== "client" ? (
                  <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-8 text-center">
                    <p className="text-[var(--ink-muted)]">Select a client to view and annotate documents.</p>
                  </div>
                ) : !document ? (
                  <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-8">
                    <p className="text-[var(--ink-muted)] mb-4">Upload a PDF for {selected.name}. One primary document per client.</p>
                    {uploadError && (
                      <div className="mb-4 rounded-[4px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
                        {uploadError}
                        <button
                          type="button"
                          onClick={() => setUploadError(null)}
                          className="ml-2 text-[var(--danger)] hover:text-[var(--danger)]"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <label className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 cursor-pointer disabled:opacity-50">
                      <Upload className="h-4 w-4" />
                      {uploading ? "Uploading…" : "Upload PDF"}
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : useTemplateMode && selectedTemplate ? (
                  <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setUseTemplateMode(false); setDocumentToAnalyzeUrl(null); setDocumentToAnalyzeFileName(null); setShowAnalyzePdfPreview(false); }}
                          className="rounded p-1 text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)]"
                          aria-label="Back"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-medium text-[var(--ink)]">
                          Using template: {selectedTemplate.name}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 space-y-4 min-h-[500px] flex flex-col">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
                          Document to analyze
                        </p>
                        <p className="text-sm text-[var(--ink-muted)] mb-2">
                          Upload a PDF to analyze using this template. This is separate from the client&apos;s main document.
                        </p>
                        {documentToAnalyzeUrl ? (
                          <>
                            <p className="text-sm text-[var(--verified)] mb-2">Document ready for generation.</p>
                            {documentToAnalyzeFileName && (
                              <p className="text-sm text-[var(--ink)] mb-2 truncate" title={documentToAnalyzeFileName}>{documentToAnalyzeFileName}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <a
                                href={documentToAnalyzeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                              >
                                <FileStack className="h-4 w-4" />
                                View PDF (new tab)
                              </a>
                              <button
                                type="button"
                                onClick={() => setShowAnalyzePdfPreview((v) => !v)}
                                className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                              >
                                {showAnalyzePdfPreview ? "Hide preview" : "Preview in app"}
                              </button>
                            </div>
                            {showAnalyzePdfPreview && (
                              <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] overflow-hidden mb-2" style={{ height: "420px" }}>
                                <iframe
                                  src={documentToAnalyzeUrl}
                                  title={documentToAnalyzeFileName || "Document to analyze"}
                                  className="w-full h-full"
                                />
                              </div>
                            )}
                          </>
                        ) : null}
                        <label className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] cursor-pointer disabled:opacity-50">
                          <Upload className="h-4 w-4" />
                          {uploadingToAnalyze ? "Uploading…" : "Upload PDF to analyze"}
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            disabled={uploadingToAnalyze}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !selected || selected.type !== "client") return;
                              setUploadingToAnalyze(true);
                              try {
                                const formData = new FormData();
                                formData.append("file", file);
                                formData.append("contactId", selected.id);
                                const res = await fetch("/api/documents/upload-analyze", { method: "POST", body: formData });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(data.error || "Upload failed");
                                setDocumentToAnalyzeUrl(data.url);
                                setDocumentToAnalyzeFileName(data.file_name ?? null);
                              } catch (err) {
                                setUploadError(err instanceof Error ? err.message : "Upload failed");
                              } finally {
                                setUploadingToAnalyze(false);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                      </div>
                      <div className="flex-1 min-h-0 flex flex-col border-t border-[var(--rule)] pt-4">
                        <DocumentSummaryChat
                          contactId={selected.id}
                          clientName={selected.name}
                          documentUrl={documentToAnalyzeUrl ?? undefined}
                          annotatedPageNumbers={selectedTemplate.annotated_page_numbers?.length ? selectedTemplate.annotated_page_numbers : []}
                          templateId={selectedTemplate.id}
                          templateName={selectedTemplate.name}
                          templateDocumentId={selectedTemplate.document_id}
                        />
                      </div>
                    </div>
                  </div>
                ) : editingTemplateAnnotations && templateDocForEdit ? (
                  <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                      <span className="text-sm font-medium text-[var(--ink)]">
                        Editing annotations for template: {editingTemplateAnnotations.name}
                      </span>
                      <button
                        type="button"
                        onClick={handleDoneEditingTemplateAnnotations}
                        className="rounded-[4px] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90"
                      >
                        Done
                      </button>
                    </div>
                    <div className="flex h-[600px]">
                      <div className="flex-1 min-w-0 border-r border-[var(--rule)]">
                        <PdfViewerWithAnnotations
                          documentId={templateDocForEdit.id}
                          fileUrl={templateDocForEdit.url}
                          fileName={templateDocForEdit.file_name}
                          annotations={templateAnnotationsForEdit}
                          onAnnotationsChange={setTemplateAnnotationsForEdit}
                        />
                      </div>
                      <div className="w-[280px] shrink-0 flex flex-col bg-[var(--canvas-subtle)] p-4 overflow-y-auto">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
                          Annotations & comments
                        </p>
                        {templateAnnotationsForEdit.length === 0 ? (
                          <p className="text-sm text-[var(--ink-muted)]">
                            Draw a box or highlight on the PDF, then add a comment.
                          </p>
                        ) : (
                          templateAnnotationsForEdit
                            .sort((a, b) => (a.page_number - b.page_number) || ((a.created_at || "").localeCompare(b.created_at || "")))
                            .map((ann) => (
                              <div key={ann.id} className="mb-2 group relative">
                                <div className="rounded-[4px] px-3 py-2 text-sm bg-[var(--ink)] text-[var(--canvas)]">
                                  <div className="flex items-center justify-between text-xs opacity-90">
                                    <span>Page {ann.page_number}</span>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          const res = await fetch(`/api/documents/annotations/${ann.id}`, { method: "DELETE", credentials: "include" });
                                          if (!res.ok) throw new Error("Failed to delete");
                                          setTemplateAnnotationsForEdit((prev) => prev.filter((a) => a.id !== ann.id));
                                        } catch (err) {
                                          console.error("Delete annotation error:", err);
                                        }
                                      }}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-[var(--canvas)]/20"
                                      title="Delete annotation"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                  <div className="mt-0.5 whitespace-pre-wrap">{ann.content || ann.type}</div>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] overflow-hidden">
                    {editingTemplateAnnotations && editingTemplateAnnotations.document_id === document.id && (
                      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                        <span className="text-sm font-medium text-[var(--ink)]">
                          Editing annotations for template: {editingTemplateAnnotations.name}
                        </span>
                        <button
                          type="button"
                          onClick={handleDoneEditingTemplateAnnotations}
                          className="rounded-[4px] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90"
                        >
                          Done
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                      <span className="text-sm font-medium text-[var(--ink)]">{document.file_name}</span>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] cursor-pointer">
                          <Upload className="h-3 w-3" />
                          Replace
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={handleUpload}
                            disabled={uploading}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleDeleteDocument}
                          disabled={deleting}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="flex h-[600px]">
                      <div className="flex-1 min-w-0 border-r border-[var(--rule)]">
                        <PdfViewerWithAnnotations
                          documentId={document.id}
                          fileUrl={document.url}
                          fileName={document.file_name}
                          annotations={annotations}
                          onAnnotationsChange={setAnnotations}
                          onLoadError={
                            selected?.type === "client"
                              ? () => loadDocument(selected.id)
                              : undefined
                          }
                        />
                      </div>
                      <div className="w-[380px] shrink-0 flex flex-col bg-[var(--canvas-subtle)]">
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          {/* Structured extraction (1099-B / DIV / R).
                              Wired to lib/documents for M1.5 "end-to-end
                              real use". Collapsible so it doesn't crowd
                              the annotations panel when unused. */}
                          <DocumentExtractionPanel documentId={document.id} />
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                            Annotations & comments
                          </p>
                          {annotations.length === 0 ? (
                            <p className="text-sm text-[var(--ink-muted)]">
                              Draw a box or highlight on the PDF, then add a comment to mark tables or sections.
                            </p>
                          ) : (
                            annotations
                              .sort((a, b) => (a.page_number - b.page_number) || ((a.created_at || "").localeCompare(b.created_at || "")))
                              .map((ann) => (
                                <div
                                  key={ann.id}
                                  className="flex justify-end group"
                                >
                                  <div className="max-w-[90%] rounded-[4px] px-3 py-2 text-sm bg-[var(--ink)] text-[var(--canvas)]">
                                    <div className="flex items-center gap-2 text-xs opacity-90">
                                      <Check className="h-3.5 w-3.5 shrink-0" />
                                      <span className="flex-1">Saved · Page {ann.page_number}</span>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const res = await fetch(`/api/documents/annotations/${ann.id}`, { method: "DELETE", credentials: "include" });
                                            if (!res.ok) throw new Error("Failed to delete");
                                            setAnnotations((prev) => prev.filter((a) => a.id !== ann.id));
                                          } catch (err) {
                                            console.error("Delete annotation error:", err);
                                          }
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-[var(--canvas)]/20"
                                        title="Delete annotation"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                    <div className="mt-0.5 whitespace-pre-wrap">
                                      {ann.content || (ann.type === "highlight" ? "(highlighted)" : ann.type)}
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                        <div className="border-t border-[var(--rule)] p-4 bg-[var(--canvas)]">
                          {annotations.length > 0 && !templateAskDismissed && !savedTemplateName && (
                            <div className="mb-4 rounded-[4px] border border-[var(--rule-strong)] bg-[var(--canvas-subtle)] p-3">
                              <p className="text-sm text-[var(--ink)] mb-3">
                                Do you want to save this annotated document as a template? You can use it later to generate summaries from other documents with the same structure.
                              </p>
                              {!showTemplateNameInput ? (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setShowTemplateNameInput(true)}
                                    className="rounded-[4px] bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90"
                                  >
                                    Save as template
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTemplateAskDismissed(true)}
                                    className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                                  >
                                    Not now
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <input
                                    type="text"
                                    value={templateName}
                                    onChange={(e) => setTemplateName(e.target.value)}
                                    placeholder="Template name"
                                    className="rounded-[4px] border border-[var(--rule)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink)]"
                                    disabled={savingTemplate}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={handleSaveAsTemplate}
                                      disabled={savingTemplate || !templateName.trim()}
                                      className="rounded-[4px] bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 disabled:opacity-50"
                                    >
                                      {savingTemplate ? "Saving…" : "Confirm"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setShowTemplateNameInput(false); setTemplateName(""); }}
                                      disabled={savingTemplate}
                                      className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {savedTemplateName && (
                            <p className="text-sm text-[var(--verified)] mb-3">Saved as template &quot;{savedTemplateName}&quot;</p>
                          )}
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-3">
                            Generate
                          </p>
                          <DocumentSummaryChat
                            contactId={selected.id}
                            clientName={selected.name}
                            documentUrl={document.url}
                            annotatedPageNumbers={[...new Set(annotations.map((a) => a.page_number))].sort((a, b) => a - b)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}
          </section>

          {/* Call audits — placeholder. Real audits open via note chips below. */}
          <section id="call-audits" className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-4">
              <span className="label-section">Call audits</span>
              <Phone className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
            </div>
            <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] p-4">
              <p className="text-sm text-[var(--ink-muted)]">
                Audits appear alongside each call-generated note below. Open a note with the &ldquo;Call recording&rdquo; chip to see citation-grounded summary segments.
              </p>
            </div>
          </section>

          {/* Notes section */}
          <section id="notes" className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-4">
              <span className="label-section">Notes</span>
              <Pencil className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
            </div>
            {activeSection === "account-overview" && (
              <div>
                {/* Notes — hand-written + AI-generated call summaries */}
                <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="label-section">All notes</h3>
                    {selected?.type === "client" && (
                      <Link
                        href={`/call?contactId=${selected.id}`}
                        className="inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition"
                        style={{
                          borderColor: "var(--rule)",
                          color: "var(--ink)",
                          background: "var(--canvas)",
                          borderRadius: "var(--r-input)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "var(--accent)";
                          e.currentTarget.style.color = "var(--accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--rule)";
                          e.currentTarget.style.color = "var(--ink)";
                        }}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        Record call
                      </Link>
                    )}
                  </div>
                  {selected?.type !== "client" ? (
                    <p className="prose-body text-sm" style={{ color: "var(--ink-muted)" }}>Select a client to view and add notes.</p>
                  ) : (
                    <div className="space-y-4">
                      <AddNoteForm contactId={selected.id} />
                      {notesLoading ? (
                        <p className="prose-body text-sm" style={{ color: "var(--ink-muted)" }}>Loading notes…</p>
                      ) : clientNotes.length === 0 ? (
                        <p className="prose-body text-sm" style={{ color: "var(--ink-muted)" }}>No notes yet. Write one above, or record a call to auto-generate one.</p>
                      ) : (
                        <ul className="space-y-2">
                          {clientNotes.map((n) => {
                            const isCallNote = n.body.startsWith("Call with");
                            const expanded = expandedNotes.has(n.id);
                            const toggleExpanded = () => {
                              setExpandedNotes((prev) => {
                                const next = new Set(prev);
                                if (next.has(n.id)) next.delete(n.id);
                                else next.add(n.id);
                                return next;
                              });
                            };
                            // For call notes, show just the header + summary
                            // until the user expands. Splits on the transcript
                            // divider so the noisy raw transcript doesn't drown
                            // the useful summary.
                            let preview = n.body;
                            let hasMore = false;
                            if (isCallNote) {
                              const markerIdx = n.body.indexOf("FULL TRANSCRIPT");
                              if (markerIdx > 0) {
                                preview = n.body.slice(0, markerIdx).replace(/\n+---\n*$/, "").trimEnd();
                                hasMore = true;
                              }
                            }
                            return (
                              <li
                                key={n.id}
                                className="border p-3 text-sm whitespace-pre-wrap prose-body"
                                style={{
                                  borderColor: "var(--rule)",
                                  background: isCallNote ? "var(--accent-soft)" : "var(--canvas-subtle)",
                                  color: "var(--ink)",
                                  borderRadius: "var(--r-card)",
                                  borderLeft: isCallNote ? "2px solid var(--accent)" : `1px solid var(--rule)`,
                                }}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                                  <span className="mono">
                                    {new Date(n.created_at).toLocaleString("en-US", {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    })}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {isCallNote && (
                                      <span className="chip-citation">Call recording</span>
                                    )}
                                    {isCallNote && (
                                      <button
                                        type="button"
                                        onClick={() => openAuditForNote(n.id)}
                                        className="inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition"
                                        style={{
                                          borderColor: "var(--ink)",
                                          color: "var(--ink)",
                                          background: "var(--canvas)",
                                          borderRadius: "var(--r-chip)",
                                          letterSpacing: "0.08em",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = "var(--ink)";
                                          e.currentTarget.style.color = "var(--canvas)";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = "var(--canvas)";
                                          e.currentTarget.style.color = "var(--ink)";
                                        }}
                                        title="See which transcript segments each claim came from"
                                      >
                                        View audit
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div>{isCallNote && hasMore && !expanded ? preview : n.body}</div>
                                {isCallNote && hasMore && (
                                  <button
                                    type="button"
                                    onClick={toggleExpanded}
                                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium transition"
                                    style={{
                                      color: "var(--ink-muted)",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ink)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-muted)"; }}
                                  >
                                    {expanded ? "▲ Hide transcript" : "▼ Show full transcript"}
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Compliance flags — placeholder. Rule-engine hits will land here. */}
          <section id="compliance-flags" className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-4">
              <span className="label-section">Compliance flags</span>
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--flag)]" strokeWidth={1.5} />
            </div>
            <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] p-4">
              <p className="text-sm text-[var(--ink-muted)]">
                No flags on this client. Rule-based triggers (RMD due, age-band transitions, suitability drift, stale review) surface here once they fire.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Edit template modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !editTemplateLoading && setEditingTemplate(null)}>
          <div className="bg-[var(--canvas)] rounded-[6px] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[var(--ink)]">Edit template</h2>
              <button type="button" onClick={() => !editTemplateLoading && setEditingTemplate(null)} className="p-1 rounded-[4px] hover:bg-[var(--canvas-subtle)]">
                <X className="h-5 w-5 text-[var(--ink-muted)]" />
              </button>
            </div>
            <p className="text-sm text-[var(--ink-muted)] mb-4">Change the template name or edit its annotations.</p>
            <form onSubmit={handleEditTemplateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--ink)] mb-1">Template name</label>
                <input
                  type="text"
                  value={editTemplateName}
                  onChange={(e) => setEditTemplateName(e.target.value)}
                  className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-2.5 text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  required
                />
              </div>
              <div className="pt-2 border-t border-[var(--rule)]">
                <p className="text-xs text-[var(--ink-muted)] mb-2">Annotations (highlights, tables, comments) define what the template extracts from documents.</p>
                <button
                  type="button"
                  onClick={() => editingTemplate && openEditTemplateAnnotations(editingTemplate)}
                  className="w-full rounded-[4px] border border-[var(--ink)] bg-[var(--canvas)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                >
                  Edit annotations in PDF
                </button>
              </div>
              {editTemplateError && (
                <p className="text-sm text-[var(--danger)]">{editTemplateError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !editTemplateLoading && setEditingTemplate(null)}
                  className="flex-1 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editTemplateLoading}
                  className="flex-1 rounded-[4px] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--accent)]/90 disabled:opacity-60"
                >
                  {editTemplateLoading ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <ConfirmationModal
          isOpen={!!confirmModal}
          onCancel={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          variant="danger"
        />
      )}

      {/* Call audit modal — opens when user clicks "View audit" on a call note */}
      {auditOpen && (
        auditLoading ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60">
            <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-6 py-5 text-sm text-[var(--ink-muted)]">
              Loading audit…
            </div>
          </div>
        ) : auditError ? (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60"
            onClick={() => {
              setAuditOpen(false);
              setAuditError(null);
              setAuditData(null);
            }}
          >
            <div
              className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-6 py-5 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold text-[var(--ink)] mb-2">
                Couldn&rsquo;t load audit
              </h3>
              <p className="text-sm text-[var(--ink-muted)] mb-4">{auditError}</p>
              <button
                type="button"
                onClick={() => {
                  setAuditOpen(false);
                  setAuditError(null);
                  setAuditData(null);
                }}
                className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Close
              </button>
            </div>
          </div>
        ) : auditData ? (
          <CallAuditView
            open={auditOpen}
            onClose={() => {
              setAuditOpen(false);
              setAuditData(null);
              setAuditError(null);
              setAuditFlags([]);
            }}
            contactName={selected?.type === "client" ? selected.name : "Client"}
            createdAt={auditData.created_at}
            transcript={auditData.transcript || ""}
            segments={auditData.transcript_segments || []}
            structured={auditData.summary_structured}
            engagement={auditData.engagement}
            flags={auditFlags}
            onFlagAction={handleFlagAction}
          />
        ) : null
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-[100] max-w-sm w-full rounded-[6px] border p-4 flex items-start gap-3 ${
          toastMsg.type === "error" ? "bg-[var(--danger)] border-[var(--danger)]/30 text-[var(--canvas)]" : "bg-[var(--verified)] border-[var(--verified)]/30 text-[var(--canvas)]"
        }`}>
          <span className="text-sm font-medium flex-1">{toastMsg.message}</span>
          <button onClick={() => setToastMsg(null)} className="flex-shrink-0 hover:bg-[var(--canvas)]/20 rounded p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
