"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm-dialog";

export default function ExportDataCard() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const ok = await confirmDialog({
      title: "Export workspace data?",
      message:
        "This will download a JSON file containing all data in your workspace — agents, contacts, conversations, documents, and more. Only share this file with people you trust.",
      confirmText: "Download export",
      variant: "info",
    });
    if (!ok) return;

    setExporting(true);
    try {
      const res = await fetch("/api/workspace/export");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        toast.error(err.error || "Export failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] || `drift-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Export ready — check your downloads folder.");
    } catch (err: any) {
      toast.error(err?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_20px_70px_rgba(8,8,16,0.6)]">
      <p className="text-xs uppercase tracking-[0.35em] text-white/50">Data</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Export workspace</h2>
      <p className="mt-3 text-sm text-white/60">
        Download every record in your workspace as a single JSON file. Satisfies
        GDPR data portability and enterprise DPA data-return requirements.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#3351ff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4a64ff] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {exporting ? "Preparing export…" : "Download export"}
      </button>
    </div>
  );
}
