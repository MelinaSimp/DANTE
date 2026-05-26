// lib/dante/tools/document.ts
//
// Document creation and editing tools for the Dante agent loop.
//
// Generates branded PDF or DOCX documents from structured sections,
// stores them in the vault, and returns metadata the agent can
// reference in its response. The chat UI renders document cards
// when the agent returns a document_created artifact.
//
// Two tools:
//   document.create — generate a new document from scratch
//   document.edit   — modify sections on an existing agent-created
//                     document and re-render it
//
// Both persist the sections JSON as vault_item.metadata.sections so
// the edit tool can round-trip without parsing binary formats.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { renderBrandedReport } from "@/lib/pdf/render";

// ── Types ────────────────────────────────────────────────────────

export interface DocumentSection {
  heading: string;
  body: string;
}

export interface CreateDocumentInput {
  workspaceId: string;
  title: string;
  subtitle?: string;
  sections: DocumentSection[];
  format: "pdf" | "docx";
  /** If provided, the document is attached to this vault project. */
  projectId?: string;
  /** If provided, pre-fills section headings from a saved template.
   *  The agent still supplies the body content for each section. */
  templateId?: string;
}

export interface EditDocumentInput {
  workspaceId: string;
  vaultItemId: string;
  operations: EditOperation[];
}

export type EditOperation =
  | { type: "append_section"; heading: string; body: string }
  | { type: "replace_section"; index: number; heading?: string; body?: string }
  | { type: "delete_section"; index: number }
  | { type: "set_title"; title: string }
  | { type: "set_subtitle"; subtitle: string };

export interface DocumentResult {
  vault_item_id: string;
  url: string | null;
  filename: string;
  format: "pdf" | "docx";
  size_bytes: number;
  title: string;
  section_count: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function slugify(text: string, max = 60): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);
}

// ── DOCX generation ──────────────────────────────────────────────

async function renderDocx(
  title: string,
  subtitle: string | undefined,
  sections: DocumentSection[],
  brandColor: string,
): Promise<Buffer> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
  } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: title, bold: true, size: 36, color: brandColor.replace("#", "") }),
      ],
      spacing: { after: 100 },
    }),
  );

  // Subtitle
  if (subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: subtitle, size: 20, color: "6b6b6b", italics: true }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  // Divider
  children.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: brandColor.replace("#", "") },
      },
      spacing: { after: 300 },
    }),
  );

  // Sections
  for (const section of sections) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: section.heading, bold: true, size: 24, color: brandColor.replace("#", "") }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      }),
    );

    // Split body into paragraphs on double newlines
    const paras = section.body.split(/\n{2,}/);
    for (const para of paras) {
      if (!para.trim()) continue;
      children.push(
        new Paragraph({
          children: [new TextRun({ text: para.trim(), size: 20 })],
          spacing: { after: 120 },
        }),
      );
    }
  }

  // Footer
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${new Date().toLocaleDateString()}`,
          size: 16,
          color: "9b9b9b",
          italics: true,
        }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 400 },
    }),
  );

  const doc = new Document({
    sections: [{ children }],
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

// ── Create ───────────────────────────────────────────────────────

export async function createDocument(input: CreateDocumentInput): Promise<DocumentResult> {
  const { workspaceId, title, subtitle, format, projectId, templateId } = input;
  let sections = input.sections;

  // If a template is specified, merge: use template section headings
  // as scaffolding and fill in agent-supplied bodies.
  if (templateId) {
    const { data: tmpl } = await supabaseAdmin
      .from("document_templates")
      .select("sections")
      .eq("id", templateId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (tmpl?.sections && Array.isArray(tmpl.sections)) {
      const tmplSections = tmpl.sections as DocumentSection[];
      // Agent may provide fewer sections than the template; use
      // template headings and fill in bodies from the agent where
      // available (by index). Extra agent sections are appended.
      sections = tmplSections.map((ts, i) => ({
        heading: ts.heading,
        body: sections[i]?.body || ts.body || "",
      }));
      // Append any extra sections the agent provided beyond template
      if (sections.length < input.sections.length) {
        sections.push(...input.sections.slice(tmplSections.length));
      }
    }
  }

  const slug = slugify(title);
  const ext = format === "docx" ? "docx" : "pdf";
  const filename = `${slug}.${ext}`;
  const storagePath = `vault/${workspaceId}/${Date.now()}_${filename}`;

  // Render the document
  let buf: Buffer;
  let contentType: string;

  if (format === "docx") {
    // Load brand color for DOCX styling
    const { data: brand } = await supabaseAdmin
      .from("workspace_branding")
      .select("brand_color_hex")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const brandColor = (brand as { brand_color_hex?: string } | null)?.brand_color_hex || "#1a3a5c";
    buf = await renderDocx(title, subtitle, sections, brandColor);
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else {
    const pdfBuf = await renderBrandedReport({
      workspaceId,
      title,
      subtitle,
      sections,
    });
    buf = Buffer.isBuffer(pdfBuf) ? pdfBuf : Buffer.from(pdfBuf);
    contentType = "application/pdf";
  }

  // Upload to storage
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("agent-files")
    .upload(storagePath, buf, { contentType, upsert: true });

  if (uploadErr) {
    throw new Error(`Document upload failed: ${uploadErr.message}`);
  }

  // Get a signed URL (24 hours)
  const { data: signed } = await supabaseAdmin.storage
    .from("agent-files")
    .createSignedUrl(storagePath, 86400);
  const url = signed?.signedUrl || null;

  // Create vault item so it's searchable and citable
  const { data: vaultItem, error: vaultErr } = await supabaseAdmin
    .from("vault_items")
    .insert({
      workspace_id: workspaceId,
      title,
      description: subtitle || null,
      file_url: storagePath,
      file_type: contentType,
      file_size: buf.byteLength,
      kind: "document",
      project_id: projectId || null,
      content: sections.map((s) => `${s.heading}\n${s.body}`).join("\n\n"),
      text_extracted: true,
      metadata: {
        generated: true,
        format: ext,
        sections,
        subtitle: subtitle || null,
      },
    })
    .select("id")
    .single();

  if (vaultErr) {
    throw new Error(`Vault item creation failed: ${vaultErr.message}`);
  }

  return {
    vault_item_id: vaultItem.id,
    url,
    filename,
    format,
    size_bytes: buf.byteLength,
    title,
    section_count: sections.length,
  };
}

// ── Edit ─────────────────────────────────────────────────────────

export async function editDocument(input: EditDocumentInput): Promise<DocumentResult> {
  const { workspaceId, vaultItemId, operations } = input;

  // Fetch the existing vault item
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from("vault_items")
    .select("id, title, description, file_type, metadata, workspace_id, project_id")
    .eq("id", vaultItemId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchErr || !item) {
    throw new Error("Document not found or access denied");
  }

  const meta = (item.metadata as {
    generated?: boolean;
    format?: string;
    sections?: DocumentSection[];
    subtitle?: string;
  } | null);

  if (!meta?.generated || !meta.sections) {
    throw new Error("Document was not created by Dante and cannot be edited. Only Dante-generated documents support section-level editing.");
  }

  let sections = [...meta.sections];
  let title = item.title as string;
  let subtitle = meta.subtitle || (item.description as string | null) || undefined;

  // Apply operations in order
  for (const op of operations) {
    switch (op.type) {
      case "append_section":
        sections.push({ heading: op.heading, body: op.body });
        break;
      case "replace_section": {
        if (op.index < 0 || op.index >= sections.length) {
          throw new Error(`Section index ${op.index} out of range (0-${sections.length - 1})`);
        }
        sections[op.index] = {
          heading: op.heading ?? sections[op.index].heading,
          body: op.body ?? sections[op.index].body,
        };
        break;
      }
      case "delete_section": {
        if (op.index < 0 || op.index >= sections.length) {
          throw new Error(`Section index ${op.index} out of range (0-${sections.length - 1})`);
        }
        sections.splice(op.index, 1);
        break;
      }
      case "set_title":
        title = op.title;
        break;
      case "set_subtitle":
        subtitle = op.subtitle;
        break;
    }
  }

  // Determine format from original
  const format = (meta.format === "docx" ? "docx" : "pdf") as "pdf" | "docx";

  // Re-create with the modified sections
  const result = await createDocument({
    workspaceId,
    title,
    subtitle,
    sections,
    format,
    projectId: (item.project_id as string | null) || undefined,
  });

  // Delete the old vault item (the new one replaces it)
  await supabaseAdmin
    .from("vault_items")
    .delete()
    .eq("id", vaultItemId);

  return result;
}

// ── Templates ────────────────────────────────────────────────────

export interface TemplateInfo {
  id: string;
  name: string;
  description: string | null;
  format: "pdf" | "docx";
  section_headings: string[];
  created_at: string;
}

/** List templates available to this workspace. */
export async function listTemplates(workspaceId: string): Promise<TemplateInfo[]> {
  const { data, error } = await supabaseAdmin
    .from("document_templates")
    .select("id, name, description, format, sections, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    format: (row.format as "pdf" | "docx") || "pdf",
    section_headings: Array.isArray(row.sections)
      ? (row.sections as DocumentSection[]).map((s) => s.heading)
      : [],
    created_at: row.created_at as string,
  }));
}

/** Save a document's section structure as a reusable template. */
export async function saveTemplate(input: {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  sections: DocumentSection[];
  format: "pdf" | "docx";
}): Promise<{ template_id: string; name: string }> {
  const { data, error } = await supabaseAdmin
    .from("document_templates")
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description || null,
      sections: input.sections,
      format: input.format,
      created_by: input.userId,
    })
    .select("id, name")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save template: ${error?.message || "unknown"}`);
  }

  return { template_id: data.id, name: data.name };
}

/** Save a template from an existing Dante-generated vault item. */
export async function saveTemplateFromDocument(input: {
  workspaceId: string;
  userId: string;
  vaultItemId: string;
  name: string;
  description?: string;
}): Promise<{ template_id: string; name: string; section_count: number }> {
  const { data: item } = await supabaseAdmin
    .from("vault_items")
    .select("metadata, file_type")
    .eq("id", input.vaultItemId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();

  const meta = item?.metadata as { generated?: boolean; format?: string; sections?: DocumentSection[] } | null;
  if (!meta?.generated || !Array.isArray(meta.sections)) {
    throw new Error("Only Dante-generated documents can be saved as templates.");
  }

  // Strip body content -- templates keep headings, clear bodies
  const templateSections: DocumentSection[] = meta.sections.map((s) => ({
    heading: s.heading,
    body: "",
  }));

  const result = await saveTemplate({
    workspaceId: input.workspaceId,
    userId: input.userId,
    name: input.name,
    description: input.description,
    sections: templateSections,
    format: (meta.format === "docx" ? "docx" : "pdf") as "pdf" | "docx",
  });

  return { ...result, section_count: templateSections.length };
}
