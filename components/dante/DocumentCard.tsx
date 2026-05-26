"use client";

// components/dante/DocumentCard.tsx
//
// Inline document card rendered below assistant messages when Dante
// generates or edits a document. Shows title, format badge, size,
// and a download button. Clicking the card itself could open the
// SourceViewer in the future; for now download is the primary action.

import { FileText, Download, FileSpreadsheet } from "lucide-react";
import type { DocumentArtifact } from "@/app/dante/streamClient";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentCard({ doc }: { doc: DocumentArtifact }) {
  const isPdf = doc.format === "pdf";
  const Icon = isPdf ? FileText : FileSpreadsheet;

  return (
    <div className="my-3 flex items-center gap-3 rounded-lg border border-black/[0.08] bg-[var(--neu-base,#f5f5f0)] px-4 py-3 shadow-sm transition-colors hover:border-black/[0.14]">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: isPdf ? "#dc2626" : "#2563eb" }}
      >
        <Icon className="h-5 w-5 text-white" strokeWidth={1.5} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--ink)] truncate">
          {doc.title}
        </p>
        <p className="text-xs text-[var(--ink-muted)] mt-0.5">
          {doc.format.toUpperCase()}
          {" -- "}
          {doc.section_count} section{doc.section_count === 1 ? "" : "s"}
          {" -- "}
          {formatBytes(doc.size_bytes)}
          {" -- "}
          Saved to vault
        </p>
      </div>

      {doc.url && (
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-3 text-xs font-medium text-[var(--ink)] shadow-sm transition-colors hover:bg-black/[0.03]"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      )}
    </div>
  );
}
