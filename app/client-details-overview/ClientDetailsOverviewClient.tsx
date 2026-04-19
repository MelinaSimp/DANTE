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
  Bot,
  Calendar,
  FileText,
  CalendarClock,
  Phone,
  Mail,
  Download,
  Share2,
  Archive,
  Inbox,
} from "lucide-react";
import dynamic from "next/dynamic";
import { formatPhoneToE164 } from "@/lib/validation";
import { supabase } from "@/lib/supabase/client";
import AddNoteForm from "@/components/notes/AddNoteForm";
import CallAuditView, {
  type StructuredSummary,
} from "@/components/call/CallAuditView";
import type { Annotation } from "@/components/documents/PdfViewerWithAnnotations";

const PdfViewerWithAnnotations = dynamic(
  () => import("@/components/documents/PdfViewerWithAnnotations"),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-zinc-400 text-sm">Loading PDF viewer…</div> }
);
const DocumentSummaryChat = dynamic(
  () => import("@/components/documents/DocumentSummaryChat"),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-4 text-zinc-400 text-sm">Loading…</div> }
);
import ConfirmationModal from "@/components/frontend/ConfirmationModal";
import { useFeatures } from "@/hooks/useFeatures";
import type { FeatureId } from "@/lib/features";
import { reportError } from "@/lib/report-error";

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

  const { features } = useFeatures();

  const sidebarNavItems = [
    { name: "Agents", icon: Bot, href: "/frontend", active: false },
    { name: "Calendar", icon: Calendar, href: agentId ? `/frontend/agent/${agentId}/schedule` : "#", active: false, featureId: "calendar" as FeatureId },
    { name: "Client Details", icon: FileText, href: "/client-details-overview", active: true, featureId: "client_details" as FeatureId },
    { name: "Meeting Planner", icon: CalendarClock, href: agentId ? `/frontend/agent/${agentId}/llm` : "#", active: false, featureId: "meeting_planner" as FeatureId },
    { name: "Sales", icon: Phone, href: agentId ? `/frontend/agent/${agentId}/sales` : "#", active: false, featureId: "sales" as FeatureId },
    { name: "Emailing", icon: Mail, href: agentId ? `/frontend/agent/${agentId}/emailing` : "#", active: false, featureId: "emailing" as FeatureId },
  ];

  const [view, setView] = useState<View>("select");
  const [selected, setSelected] = useState<SelectedEntity>(null);
  const [activeSection, setActiveSection] = useState("account-overview");
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
    created_at: string;
    note_id: string | null;
  };
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const openAuditForNote = useCallback(async (noteId: string) => {
    setAuditOpen(true);
    setAuditLoading(true);
    setAuditError(null);
    setAuditData(null);
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
      }
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setAuditLoading(false);
    }
  }, []);
  const [useTemplateMode, setUseTemplateMode] = useState(false);
  const [documentToAnalyzeUrl, setDocumentToAnalyzeUrl] = useState<string | null>(null);
  const [documentToAnalyzeFileName, setDocumentToAnalyzeFileName] = useState<string | null>(null);
  const [uploadingToAnalyze, setUploadingToAnalyze] = useState(false);
  const [showAnalyzePdfPreview, setShowAnalyzePdfPreview] = useState(false);
  // Client list (synced from server, append on add)
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  // Add client modal
  const [showAddClient, setShowAddClient] = useState(false);
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

  // Pink/blue halo component (matches frontend)
  const IconHalo = ({ children, className = "", shape = "circle" }: { children: React.ReactNode; className?: string; shape?: "circle" | "square" }) => (
    <div className={`relative ${className}`}>
      <div className={`absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 blur-sm opacity-50 ${shape === "square" ? "rounded-sm" : "rounded-full"}`} aria-hidden />
      <div className="relative">{children}</div>
    </div>
  );

  // ——— Selection screen (household vs client bars) ———
  if (view === "select") {
    return (
      <div className={panelMode ? "bg-white text-[#151515]" : "min-h-[calc(100vh-4rem)] bg-[#f5f5f7] text-[#151515]"}>
        <div className={panelMode ? "mx-auto max-w-2xl px-6 py-8" : "mx-auto max-w-2xl px-6 py-12"}>
          {!panelMode && (
            <button
              type="button"
              onClick={() => router.back()}
              className="mb-6 flex items-center gap-2 text-sm font-medium text-[#6b7280] hover:text-[#151515] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-purple-400/20 via-pink-500/20 to-blue-500/20 rounded-3xl blur-2xl -z-10" aria-hidden />
            <p className="text-center text-sm text-[#151515]/60">{formatTime()}</p>
            <h1 className="mt-2 text-center text-2xl font-bold text-[#151515]">
              Prepare a report for a client?
            </h1>
          </div>

          <div className="mt-10 space-y-4 relative">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-[#6b7280]">Select a client</p>
              <button
                type="button"
                onClick={() => { setShowAddClient(true); setAddClientError(null); }}
                className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#ffffff] px-4 py-2 text-sm font-medium text-[#151515] shadow-sm transition hover:border-[#3166bf]/40 hover:bg-[#fafafa]"
              >
                <UserPlus className="h-4 w-4" />
                Add client
              </button>
            </div>

            {/* Client cards — rounder, no halo; click to select, Edit/Delete on right */}
            {contacts.length === 0 ? (
              <p className="text-center text-sm text-[#6b7280] py-4">No contacts yet. Click &quot;Add client&quot; to add one.</p>
            ) : (
              contacts.map((client) => (
                <div
                  key={client.id}
                  className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[#e5e7eb] bg-[#ffffff] px-5 py-4 shadow-sm transition hover:border-[#3166bf]/40 hover:bg-[#fafafa]"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectClient(client)}
                    className="flex flex-1 min-w-0 items-center justify-between gap-3 text-left"
                  >
                    <span className="text-lg font-semibold text-[#151515] truncate">{client.name}</span>
                    {client.phone && (
                      <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm text-[#2563eb] shrink-0">
                        {client.phone}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openEditModal(client); }}
                      className="p-2 rounded-xl text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]"
                      title="Edit client"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteClient(client); }}
                      disabled={deletingContactId === client.id}
                      className="p-2 rounded-xl text-[#6b7280] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="Delete client"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add client modal */}
          {showAddClient && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !addClientLoading && setShowAddClient(false)}>
              <div className="bg-[#ffffff] rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-[#151515]">Add client</h2>
                  <button type="button" onClick={() => !addClientLoading && setShowAddClient(false)} className="p-1 rounded-xl hover:bg-[#f3f4f6]">
                    <X className="h-5 w-5 text-[#6b7280]" />
                  </button>
                </div>
                <p className="text-sm text-[#6b7280] mb-4">All fields are required. Phone can include country code (e.g. +1 216 509 9657).</p>
                <form onSubmit={handleAddClientSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">First name</label>
                    <input
                      type="text"
                      value={addClientFirstName}
                      onChange={(e) => setAddClientFirstName(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] placeholder:text-[#9ca3af] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                      placeholder="Jane"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">Last name</label>
                    <input
                      type="text"
                      value={addClientLastName}
                      onChange={(e) => setAddClientLastName(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] placeholder:text-[#9ca3af] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                      placeholder="Doe"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">Phone number</label>
                    <input
                      type="tel"
                      value={addClientPhone}
                      onChange={(e) => setAddClientPhone(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] placeholder:text-[#9ca3af] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                      placeholder="+1 216 509 9657"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">Email</label>
                    <input
                      type="email"
                      value={addClientEmail}
                      onChange={(e) => setAddClientEmail(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] placeholder:text-[#9ca3af] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                      placeholder="jane@example.com"
                      required
                    />
                  </div>
                  {addClientError && (
                    <p className="text-sm text-red-600">{addClientError}</p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => !addClientLoading && setShowAddClient(false)}
                      className="flex-1 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-sm font-medium text-[#374151] hover:bg-[#f3f4f6]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addClientLoading}
                      className="flex-1 rounded-xl bg-[#3166bf] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-60"
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
              <div className="bg-[#ffffff] rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-[#151515]">Edit client</h2>
                  <button type="button" onClick={() => !editLoading && setEditingContact(null)} className="p-1 rounded-xl hover:bg-[#f3f4f6]">
                    <X className="h-5 w-5 text-[#6b7280]" />
                  </button>
                </div>
                <p className="text-sm text-[#6b7280] mb-4">Update client details. All fields are required.</p>
                <form onSubmit={handleEditSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">First name</label>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">Last name</label>
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">Phone number</label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                      required
                    />
                  </div>
                  {editError && (
                    <p className="text-sm text-red-600">{editError}</p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => !editLoading && setEditingContact(null)}
                      className="flex-1 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-sm font-medium text-[#374151] hover:bg-[#f3f4f6]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={editLoading}
                      className="flex-1 rounded-xl bg-[#3166bf] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-60"
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
            <div className={`fixed top-4 right-4 z-[100] max-w-sm w-full rounded-2xl shadow-lg border p-4 flex items-start gap-3 ${
              toastMsg.type === "error" ? "bg-red-500/95 border-red-400 text-white" : "bg-green-500/95 border-green-400 text-white"
            }`}>
              <span className="text-sm font-medium flex-1">{toastMsg.message}</span>
              <button onClick={() => setToastMsg(null)} className="flex-shrink-0 hover:bg-white/20 rounded p-1">
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
    <div className={panelMode ? "flex bg-white text-[#151515] h-full" : "min-h-[calc(100vh-4rem)] flex bg-[#f5f5f7] text-[#151515]"}>
      {!panelMode && (
        <div className="hidden md:flex flex-col w-48 border-r border-gray-200 bg-white shrink-0">
          <div className="p-4 border-b border-gray-200 flex items-center gap-2">
            <Link href="/frontend" className="flex items-center gap-2">
              <img src="/brand/logo-circle.png" alt="Drift" className="w-7 h-7 rounded-full object-cover" />
              <span className="text-sm font-semibold text-gray-900">Drift</span>
            </Link>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {sidebarNavItems.filter((item) => !item.featureId || features.includes(item.featureId)).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    item.active ? "bg-gray-100 text-black" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e5e7eb] bg-[#ffffff] px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-[#151515]">Overview on {displayName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#6b7280]">{formatTime()}</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setActionsOpen(!actionsOpen)}
                className="flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-sm font-medium text-[#151515] hover:bg-[#f3f4f6]"
              >
                Actions <ChevronDown className={`h-4 w-4 transition-transform ${actionsOpen ? "rotate-180" : ""}`} />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-[#e5e7eb] bg-white shadow-lg z-20 py-1" onMouseLeave={() => setActionsOpen(false)}>
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
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[#374151] hover:bg-[#f3f4f6]"
                  >
                    <Download className="h-4 w-4" /> Export Data
                  </button>
                  <button
                    onClick={() => {
                      if (selected?.type === "client" && typeof navigator !== "undefined") {
                        navigator.clipboard.writeText(`${window.location.origin}/client-details-overview?client=${selected.id}`);
                      }
                      setActionsOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[#374151] hover:bg-[#f3f4f6]"
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
                className="rounded-xl p-2 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]"
                aria-label="Back to clients"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <Link
                href="/client-details-overview"
                className="rounded-xl p-2 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>

        {/* Content card */}
        <div className="mx-6 my-6 max-w-4xl">
          <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-6 shadow-sm">
            <p className="text-sm text-[#6b7280]">{formatTime()}</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-[#151515]">
              <span className="text-[#3166bf]">V</span>
              Here&apos;s an overview on {displayName}.
            </h2>
            <p className="mt-3 text-[#374151]">
              {document
                ? `${displayName} has a document on file and ${templates.length} template${templates.length !== 1 ? "s" : ""} available.`
                : `No documents uploaded yet for ${displayName}. Upload documents to get started.`}
            </p>

            {activeSection === "account-overview" && (
              <div className="mt-8 space-y-8">
                {/* Templates at top */}
                <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6b7280] mb-3">Templates</h3>
                  {selected?.type !== "client" ? (
                    <p className="text-sm text-[#6b7280]">Select a client to view and use templates.</p>
                  ) : templates.length > 0 ? (
                    <div className="space-y-2">
                      {templates.map((t) => (
                        <div
                          key={t.id}
                          className={`rounded-xl border p-2 text-sm cursor-pointer transition ${
                            selectedTemplate?.id === t.id
                              ? "border-black bg-gray-50"
                              : "border-[#e5e7eb] bg-[#f9fafb] hover:bg-[#f3f4f6]"
                          }`}
                          onClick={() => setSelectedTemplate(selectedTemplate?.id === t.id ? null : t)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileStack className="h-4 w-4 shrink-0 text-[#6b7280]" />
                              <span className="font-medium text-[#374151] truncate">{t.name}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => openEditTemplateModal(t)}
                                className="rounded p-1 text-[#6b7280] hover:bg-[#e5e7eb] hover:text-[#374151]"
                                title="Edit template"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTemplate(t)}
                                className="rounded p-1 text-[#6b7280] hover:bg-red-50 hover:text-red-600"
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
                              className="mt-2 w-full rounded-xl bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                            >
                              Use this template
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#6b7280]">No templates yet. Upload a document below, add annotations, then save as a template.</p>
                  )}
                </div>

                {/* Document upload / viewer + annotations + generate */}
                <div className="mt-8">
                {selected?.type !== "client" ? (
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-8 text-center">
                    <p className="text-[#6b7280]">Select a client to view and annotate documents.</p>
                  </div>
                ) : !document ? (
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-8">
                    <p className="text-[#6b7280] mb-4">Upload a PDF for {selected.name}. One primary document per client.</p>
                    {uploadError && (
                      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {uploadError}
                        <button
                          type="button"
                          onClick={() => setUploadError(null)}
                          className="ml-2 text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <label className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 cursor-pointer disabled:opacity-50">
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
                  <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-[#e5e7eb] bg-[#f9fafb]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setUseTemplateMode(false); setDocumentToAnalyzeUrl(null); setDocumentToAnalyzeFileName(null); setShowAnalyzePdfPreview(false); }}
                          className="rounded p-1 text-[#6b7280] hover:bg-[#e5e7eb] hover:text-[#374151]"
                          aria-label="Back"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-medium text-[#374151]">
                          Using template: {selectedTemplate.name}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 space-y-4 min-h-[500px] flex flex-col">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280] mb-2">
                          Document to analyze
                        </p>
                        <p className="text-sm text-[#6b7280] mb-2">
                          Upload a PDF to analyze using this template. This is separate from the client&apos;s main document.
                        </p>
                        {documentToAnalyzeUrl ? (
                          <>
                            <p className="text-sm text-green-700 mb-2">Document ready for generation.</p>
                            {documentToAnalyzeFileName && (
                              <p className="text-sm text-[#374151] mb-2 truncate" title={documentToAnalyzeFileName}>{documentToAnalyzeFileName}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <a
                                href={documentToAnalyzeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]"
                              >
                                <FileStack className="h-4 w-4" />
                                View PDF (new tab)
                              </a>
                              <button
                                type="button"
                                onClick={() => setShowAnalyzePdfPreview((v) => !v)}
                                className="inline-flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]"
                              >
                                {showAnalyzePdfPreview ? "Hide preview" : "Preview in app"}
                              </button>
                            </div>
                            {showAnalyzePdfPreview && (
                              <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] overflow-hidden mb-2" style={{ height: "420px" }}>
                                <iframe
                                  src={documentToAnalyzeUrl}
                                  title={documentToAnalyzeFileName || "Document to analyze"}
                                  className="w-full h-full"
                                />
                              </div>
                            )}
                          </>
                        ) : null}
                        <label className="inline-flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb] cursor-pointer disabled:opacity-50">
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
                      <div className="flex-1 min-h-0 flex flex-col border-t border-[#e5e7eb] pt-4">
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
                  <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-[#e5e7eb] bg-gray-50">
                      <span className="text-sm font-medium text-black">
                        Editing annotations for template: {editingTemplateAnnotations.name}
                      </span>
                      <button
                        type="button"
                        onClick={handleDoneEditingTemplateAnnotations}
                        className="rounded-xl bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                      >
                        Done
                      </button>
                    </div>
                    <div className="flex h-[600px]">
                      <div className="flex-1 min-w-0 border-r border-[#e5e7eb]">
                        <PdfViewerWithAnnotations
                          documentId={templateDocForEdit.id}
                          fileUrl={templateDocForEdit.url}
                          fileName={templateDocForEdit.file_name}
                          annotations={templateAnnotationsForEdit}
                          onAnnotationsChange={setTemplateAnnotationsForEdit}
                        />
                      </div>
                      <div className="w-[280px] shrink-0 flex flex-col bg-[#f9fafb] p-4 overflow-y-auto">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280] mb-2">
                          Annotations & comments
                        </p>
                        {templateAnnotationsForEdit.length === 0 ? (
                          <p className="text-sm text-[#6b7280]">
                            Draw a box or highlight on the PDF, then add a comment.
                          </p>
                        ) : (
                          templateAnnotationsForEdit
                            .sort((a, b) => (a.page_number - b.page_number) || ((a.created_at || "").localeCompare(b.created_at || "")))
                            .map((ann) => (
                              <div key={ann.id} className="mb-2 group relative">
                                <div className="rounded-xl px-3 py-2 text-sm bg-black text-white">
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
                                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-white/20"
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
                  <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
                    {editingTemplateAnnotations && editingTemplateAnnotations.document_id === document.id && (
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
                        <span className="text-sm font-medium text-black">
                          Editing annotations for template: {editingTemplateAnnotations.name}
                        </span>
                        <button
                          type="button"
                          onClick={handleDoneEditingTemplateAnnotations}
                          className="rounded-xl bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                        >
                          Done
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-[#e5e7eb] bg-[#f9fafb]">
                      <span className="text-sm font-medium text-[#374151]">{document.file_name}</span>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#6b7280] hover:bg-[#e5e7eb] cursor-pointer">
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
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="flex h-[600px]">
                      <div className="flex-1 min-w-0 border-r border-[#e5e7eb]">
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
                      <div className="w-[380px] shrink-0 flex flex-col bg-[#f9fafb]">
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
                            Annotations & comments
                          </p>
                          {annotations.length === 0 ? (
                            <p className="text-sm text-[#6b7280]">
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
                                  <div className="max-w-[90%] rounded-xl px-3 py-2 text-sm bg-black text-white">
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
                                        className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-white/20"
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
                        <div className="border-t border-[#e5e7eb] p-4 bg-white">
                          {annotations.length > 0 && !templateAskDismissed && !savedTemplateName && (
                            <div className="mb-4 rounded-xl border border-gray-300 bg-gray-50 p-3">
                              <p className="text-sm text-black mb-3">
                                Do you want to save this annotated document as a template? You can use it later to generate summaries from other documents with the same structure.
                              </p>
                              {!showTemplateNameInput ? (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setShowTemplateNameInput(true)}
                                    className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
                                  >
                                    Save as template
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTemplateAskDismissed(true)}
                                    className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]"
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
                                    className="rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    disabled={savingTemplate}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={handleSaveAsTemplate}
                                      disabled={savingTemplate || !templateName.trim()}
                                      className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                                    >
                                      {savingTemplate ? "Saving…" : "Confirm"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setShowTemplateNameInput(false); setTemplateName(""); }}
                                      disabled={savingTemplate}
                                      className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {savedTemplateName && (
                            <p className="text-sm text-green-700 mb-3">Saved as template &quot;{savedTemplateName}&quot;</p>
                          )}
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280] mb-3">
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

                {/* Notes — hand-written + AI-generated call summaries */}
                <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6b7280]">Notes</h3>
                    {selected?.type === "client" && (
                      <Link
                        href={`/call?contactId=${selected.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#151515] hover:border-[#3166bf] hover:text-[#3166bf]"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        Record call
                      </Link>
                    )}
                  </div>
                  {selected?.type !== "client" ? (
                    <p className="text-sm text-[#6b7280]">Select a client to view and add notes.</p>
                  ) : (
                    <div className="space-y-4">
                      <AddNoteForm contactId={selected.id} />
                      {notesLoading ? (
                        <p className="text-sm text-[#6b7280]">Loading notes…</p>
                      ) : clientNotes.length === 0 ? (
                        <p className="text-sm text-[#6b7280]">No notes yet. Write one above, or record a call to auto-generate one.</p>
                      ) : (
                        <ul className="space-y-3">
                          {clientNotes.map((n) => {
                            const isCallNote = n.body.startsWith("📞 Call with");
                            return (
                              <li
                                key={n.id}
                                className={`rounded-xl border p-3 text-sm whitespace-pre-wrap ${
                                  isCallNote
                                    ? "border-[#3166bf]/30 bg-[#3166bf]/5 text-[#151515]"
                                    : "border-[#e5e7eb] bg-[#f9fafb] text-[#374151]"
                                }`}
                              >
                                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[#6b7280]">
                                  <span>
                                    {new Date(n.created_at).toLocaleString("en-US", {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    })}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {isCallNote && (
                                      <span className="rounded-full bg-[#3166bf]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#3166bf]">
                                        Call recording
                                      </span>
                                    )}
                                    {isCallNote && (
                                      <button
                                        type="button"
                                        onClick={() => openAuditForNote(n.id)}
                                        className="inline-flex items-center gap-1 rounded-full border border-[#3166bf]/40 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#3166bf] hover:bg-[#3166bf] hover:text-white transition"
                                        title="See which transcript segments each claim came from"
                                      >
                                        View audit
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div>{n.body}</div>
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


          </div>
        </div>
      </div>

      {/* Edit template modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !editTemplateLoading && setEditingTemplate(null)}>
          <div className="bg-[#ffffff] rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[#151515]">Edit template</h2>
              <button type="button" onClick={() => !editTemplateLoading && setEditingTemplate(null)} className="p-1 rounded-xl hover:bg-[#f3f4f6]">
                <X className="h-5 w-5 text-[#6b7280]" />
              </button>
            </div>
            <p className="text-sm text-[#6b7280] mb-4">Change the template name or edit its annotations.</p>
            <form onSubmit={handleEditTemplateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">Template name</label>
                <input
                  type="text"
                  value={editTemplateName}
                  onChange={(e) => setEditTemplateName(e.target.value)}
                  className="w-full rounded-xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-2.5 text-[#151515] focus:border-[#3166bf] focus:outline-none focus:ring-1 focus:ring-[#3166bf]"
                  required
                />
              </div>
              <div className="pt-2 border-t border-[#e5e7eb]">
                <p className="text-xs text-[#6b7280] mb-2">Annotations (highlights, tables, comments) define what the template extracts from documents.</p>
                <button
                  type="button"
                  onClick={() => editingTemplate && openEditTemplateAnnotations(editingTemplate)}
                  className="w-full rounded-xl border border-black bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-gray-50"
                >
                  Edit annotations in PDF
                </button>
              </div>
              {editTemplateError && (
                <p className="text-sm text-red-600">{editTemplateError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !editTemplateLoading && setEditingTemplate(null)}
                  className="flex-1 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-sm font-medium text-[#374151] hover:bg-[#f3f4f6]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editTemplateLoading}
                  className="flex-1 rounded-xl bg-[#3166bf] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-60"
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
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="rounded-2xl border border-[#e5e7eb] bg-white px-6 py-5 text-sm text-[#151515]/70 shadow-2xl">
              Loading audit…
            </div>
          </div>
        ) : auditError ? (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setAuditOpen(false);
              setAuditError(null);
              setAuditData(null);
            }}
          >
            <div
              className="rounded-2xl border border-[#e5e7eb] bg-white px-6 py-5 shadow-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold text-[#151515] mb-2">
                Couldn&rsquo;t load audit
              </h3>
              <p className="text-sm text-[#151515]/70 mb-4">{auditError}</p>
              <button
                type="button"
                onClick={() => {
                  setAuditOpen(false);
                  setAuditError(null);
                  setAuditData(null);
                }}
                className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#151515] hover:border-[#3166bf] hover:text-[#3166bf]"
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
            }}
            contactName={selected?.type === "client" ? selected.name : "Client"}
            createdAt={auditData.created_at}
            transcript={auditData.transcript || ""}
            segments={auditData.transcript_segments || []}
            structured={auditData.summary_structured}
          />
        ) : null
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-[100] max-w-sm w-full rounded-2xl shadow-lg border p-4 flex items-start gap-3 ${
          toastMsg.type === "error" ? "bg-red-500/95 border-red-400 text-white" : "bg-green-500/95 border-green-400 text-white"
        }`}>
          <span className="text-sm font-medium flex-1">{toastMsg.message}</span>
          <button onClick={() => setToastMsg(null)} className="flex-shrink-0 hover:bg-white/20 rounded p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
