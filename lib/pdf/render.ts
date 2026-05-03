// lib/pdf/render.ts
//
// Phase 6 W6.7 — print-quality PDF outputs.
//
// Used for:
//   - chat-response export to PDF (advisor sends to a client / board)
//   - audit pack render (compliance export → PDF instead of JSON)
//   - per-vertical report templates (advisor: quarterly summary;
//     realtor: tour recap)
//
// Approach: server-side HTML → PDF via @react-pdf/renderer. Keeps
// the rendering pipeline JS-only (no headless Chrome required).
// Branding (logo, brand color, header text) pulled from
// workspace_branding so PDFs come out firm-styled.
//
// This file is the rendering primitive. Specific document types
// (chat export, audit pack) compose it.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface BrandingContext {
  workspaceName: string;
  brandColorHex: string | null;
  pdfHeaderText: string | null;
  logoUrl: string | null; // public Supabase storage URL when set
}

export async function loadBrandingContext(
  workspaceId: string,
): Promise<BrandingContext> {
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();
  const { data: brand } = await supabaseAdmin
    .from("workspace_branding")
    .select("brand_color_hex, pdf_header_text, logo_storage_path")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let logoUrl: string | null = null;
  const logoPath = (brand as { logo_storage_path?: string } | null)?.logo_storage_path;
  if (logoPath) {
    const { data } = await supabaseAdmin.storage
      .from("workspace-assets")
      .createSignedUrl(logoPath, 3600);
    logoUrl = data?.signedUrl ?? null;
  }

  return {
    workspaceName: (ws as { name?: string } | null)?.name ?? "Workspace",
    brandColorHex: (brand as { brand_color_hex?: string } | null)?.brand_color_hex ?? null,
    pdfHeaderText: (brand as { pdf_header_text?: string } | null)?.pdf_header_text ?? null,
    logoUrl,
  };
}

/**
 * Render a generic "branded report" PDF from a sequence of
 * sections. Each section is a heading + body markdown. This is
 * the primitive callers (chat export, audit pack) compose.
 *
 * Returns a Buffer the caller can stream as application/pdf.
 *
 * Implementation note: we lazy-import @react-pdf/renderer so the
 * dependency stays out of cold-start for routes that don't render
 * PDFs.
 */
export interface ReportSection {
  heading: string;
  body: string;
}

export interface RenderReportInput {
  workspaceId: string;
  title: string;
  subtitle?: string;
  sections: ReportSection[];
}

export async function renderBrandedReport(input: RenderReportInput): Promise<Buffer> {
  const branding = await loadBrandingContext(input.workspaceId);

  // Lazy import keeps cold-start small. If @react-pdf/renderer
  // isn't installed (it's an optional dep), we throw a clear error
  // rather than crashing — the caller can fall back to JSON.
  // Typed as `any` because the dep is optional; install
  // @react-pdf/renderer for the strongly-typed path.
  let reactPdf: any;
  try {
    reactPdf = await import("@react-pdf/renderer" as never);
  } catch {
    throw new Error(
      "PDF rendering not available — @react-pdf/renderer is not installed. Run `npm install @react-pdf/renderer` to enable.",
    );
  }
  const { Document, Page, Text, View, StyleSheet, pdf, Image } = reactPdf;
  const React = (await import("react")).default;

  const accent = branding.brandColorHex ?? "#1a3a5c";
  const styles = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#151515" },
    header: { marginBottom: 24, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: accent },
    title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
    subtitle: { fontSize: 10, color: "#6b6b6b" },
    sectionHeading: { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 6, color: accent },
    sectionBody: { fontSize: 10, lineHeight: 1.6 },
    footer: {
      position: "absolute",
      bottom: 20,
      left: 40,
      right: 40,
      fontSize: 8,
      color: "#9b9b9b",
      borderTopWidth: 1,
      borderTopColor: "#e5e5e5",
      paddingTop: 6,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    logo: { width: 80, height: 24, marginBottom: 8, objectFit: "contain" },
  });

  const sectionElems = input.sections.map((s, i) =>
    React.createElement(View, { key: i, wrap: false }, [
      React.createElement(Text, { key: "h", style: styles.sectionHeading }, s.heading),
      React.createElement(Text, { key: "b", style: styles.sectionBody }, s.body),
    ]),
  );

  const headerChildren: React.ReactNode[] = [];
  if (branding.logoUrl) {
    headerChildren.push(
      React.createElement(Image, { key: "logo", style: styles.logo, src: branding.logoUrl }),
    );
  }
  headerChildren.push(
    React.createElement(Text, { key: "title", style: styles.title }, input.title),
  );
  if (input.subtitle) {
    headerChildren.push(
      React.createElement(Text, { key: "subtitle", style: styles.subtitle }, input.subtitle),
    );
  }

  const footerLeft = branding.pdfHeaderText || branding.workspaceName;
  const footerRight = `Generated ${new Date().toLocaleDateString()}`;

  const docElement = React.createElement(
    Document,
    {},
    React.createElement(Page, { size: "LETTER", style: styles.page }, [
      React.createElement(View, { key: "h", style: styles.header }, headerChildren),
      ...sectionElems,
      React.createElement(
        View,
        { key: "f", style: styles.footer, fixed: true },
        [
          React.createElement(Text, { key: "l" }, footerLeft),
          React.createElement(Text, { key: "r" }, footerRight),
        ],
      ),
    ]),
  );

  // pdf().toBuffer() returns a Node Buffer.
  const stream = pdf(docElement as never);
  const buf = await stream.toBuffer();
  return buf as Buffer;
}
