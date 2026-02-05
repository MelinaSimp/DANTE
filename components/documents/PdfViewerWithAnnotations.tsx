"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  Highlighter,
  MessageSquare,
  Tag,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type AnnotationType = "highlight" | "comment" | "tag";

export interface Annotation {
  id: string;
  document_id: string;
  page_number: number;
  type: AnnotationType;
  content: string | null;
  bounding_box: { x: number; y: number; width: number; height: number };
  created_at?: string;
}

interface PdfViewerWithAnnotationsProps {
  documentId: string;
  fileUrl: string;
  fileName: string;
  annotations: Annotation[];
  /** Accepts new list or updater (prev => newList) so add/delete don't use stale state */
  onAnnotationsChange: (annotations: Annotation[] | ((prev: Annotation[]) => Annotation[])) => void;
  readOnly?: boolean;
}

export default function PdfViewerWithAnnotations({
  documentId,
  fileUrl,
  fileName,
  annotations,
  onAnnotationsChange,
  readOnly = false,
}: PdfViewerWithAnnotationsProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageWidth, setPageWidth] = useState(600);
  const [fitToWidth, setFitToWidth] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<AnnotationType | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [pendingContent, setPendingContent] = useState<string>("");
  const [showContentModal, setShowContentModal] = useState(false);
  const [pendingBox, setPendingBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  }, []);

  // Fit to container width when fitToWidth is true
  useEffect(() => {
    if (!fitToWidth || !containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - 32; // padding
        setPageWidth(Math.max(200, Math.min(w, 1200)));
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fitToWidth, pageNumber, numPages]);

  const handleZoomIn = () => {
    setFitToWidth(false);
    setPageWidth((w) => Math.min(w * 1.25, 1600));
  };
  const handleZoomOut = () => {
    setFitToWidth(false);
    setPageWidth((w) => Math.max(w * 0.8, 200));
  };
  const handleFitToPage = () => {
    setFitToWidth(true);
  };

  const pageAnnotations = annotations.filter((a) => a.page_number === pageNumber);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !activeTool) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrawing(true);
    setDrawStart({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing || !drawStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const minX = Math.min(drawStart.x, x);
    const minY = Math.min(drawStart.y, y);
    const width = Math.abs(x - drawStart.x);
    const height = Math.abs(y - drawStart.y);
    setPendingBox({ x: minX, y: minY, width, height });
  };

  const handleMouseUp = () => {
    if (!drawing || !drawStart || !activeTool) return;
    setDrawing(false);
    const box = pendingBox || {
      x: drawStart.x,
      y: drawStart.y,
      width: 0.02,
      height: 0.02,
    };
    setDrawStart(null);
    setPendingBox(null);

    // All tools (highlight, comment, tag) can add a comment
    setPendingBox(box);
    setShowContentModal(true);
  };

  const addAnnotation = async (
    type: AnnotationType,
    bounding_box: { x: number; y: number; width: number; height: number },
    content: string | null
  ): Promise<boolean> => {
    setSaveError(null);
    try {
      const res = await fetch("/api/documents/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          page_number: pageNumber,
          type,
          content,
          bounding_box,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save annotation");
      }
      onAnnotationsChange((prev) => [...prev, data]);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setSaveError(msg);
      console.error(err);
      return false;
    }
  };

  const handleContentSubmit = async () => {
    if (!pendingBox || !activeTool || saving) return;
    setSaving(true);
    const ok = await addAnnotation(activeTool, pendingBox, pendingContent || null);
    setSaving(false);
    if (ok) {
      setPendingContent("");
      setPendingBox(null);
      setShowContentModal(false);
    }
  };

  const deleteAnnotation = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/annotations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      onAnnotationsChange((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f5f7] rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 bg-white border-b border-[#e5e7eb] flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="rounded p-2 text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-[#374151]">
            Page {pageNumber} of {numPages || "—"}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.min(numPages || 1, p + 1))}
            disabled={pageNumber >= numPages}
            className="rounded p-2 text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            className="rounded p-2 text-[#6b7280] hover:bg-[#f3f4f6]"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleFitToPage}
            className={`rounded px-2 py-1 text-xs font-medium ${fitToWidth ? "bg-blue-100 text-blue-800" : "text-[#6b7280] hover:bg-[#f3f4f6]"}`}
            title="Fit to page"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="rounded p-2 text-[#6b7280] hover:bg-[#f3f4f6]"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTool(activeTool === "highlight" ? null : "highlight")}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                activeTool === "highlight"
                  ? "bg-amber-100 text-amber-800"
                  : "text-[#6b7280] hover:bg-[#f3f4f6]"
              }`}
            >
              <Highlighter className="h-4 w-4" />
              Highlight
            </button>
            <button
              type="button"
              onClick={() => setActiveTool(activeTool === "comment" ? null : "comment")}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                activeTool === "comment"
                  ? "bg-blue-100 text-blue-800"
                  : "text-[#6b7280] hover:bg-[#f3f4f6]"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Comment
            </button>
            <button
              type="button"
              onClick={() => setActiveTool(activeTool === "tag" ? null : "tag")}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                activeTool === "tag"
                  ? "bg-purple-100 text-purple-800"
                  : "text-[#6b7280] hover:bg-[#f3f4f6]"
              }`}
            >
              <Tag className="h-4 w-4" />
              Tag
            </button>
          </div>
        )}
      </div>

      {/* PDF + annotations */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4 flex justify-center min-h-0">
        <div className="relative inline-block">
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center w-[600px] h-[800px] bg-white rounded-lg">
                <p className="text-[#6b7280]">Loading PDF…</p>
              </div>
            }
            error={
              <div className="flex items-center justify-center w-[600px] h-[400px] bg-red-50 rounded-lg">
                <p className="text-red-600">Failed to load PDF</p>
              </div>
            }
          >
            <div
              ref={(el) => {
                pageRefs.current[pageNumber] = el;
              }}
              className="relative"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                renderTextLayer={true}
                renderAnnotationLayer={false}
              />
              {/* Annotation overlay - uses % for scale-independent positioning */}
              <div className="absolute inset-0 pointer-events-none">
                {pageAnnotations.map((ann) => {
                  const bb = ann.bounding_box;
                  const left = bb.x * 100;
                  const top = bb.y * 100;
                  const w = Math.max(bb.width * 100, 1);
                  const h = Math.max(bb.height * 100, 1);
                  return (
                    <div
                      key={ann.id}
                      className={`absolute pointer-events-auto group ${
                        readOnly ? "" : "cursor-pointer hover:ring-2 hover:ring-blue-400"
                      }`}
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        width: `${w}%`,
                        height: `${h}%`,
                      }}
                    >
                      {ann.type === "highlight" && (
                        <div className="w-full h-full bg-amber-300/60 rounded-sm" />
                      )}
                      {ann.type === "comment" && (
                        <div className="w-full h-full min-w-[24px] min-h-[24px] bg-blue-200/70 rounded flex items-center justify-center">
                          <span className="text-xs text-blue-900 truncate px-1">
                            {ann.content || "…"}
                          </span>
                        </div>
                      )}
                      {ann.type === "tag" && (
                        <div className="w-full h-full min-w-[24px] min-h-[24px] bg-purple-200/70 rounded flex items-center justify-center">
                          <span className="text-xs text-purple-900 truncate px-1">
                            {ann.content || "tag"}
                          </span>
                        </div>
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => deleteAnnotation(ann.id)}
                          className="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {drawing && pendingBox && (
                  <div
                    className="absolute border-2 border-dashed border-blue-500 bg-blue-500/20 pointer-events-none"
                    style={{
                      left: `${pendingBox.x * 100}%`,
                      top: `${pendingBox.y * 100}%`,
                      width: `${Math.max(pendingBox.width * 100, 1)}%`,
                      height: `${Math.max(pendingBox.height * 100, 1)}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </Document>
        </div>
      </div>

      {/* Content modal for comment/tag */}
      {showContentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-4 w-80">
            <p className="text-sm font-medium text-[#374151] mb-2">
              {activeTool === "highlight" ? "Add comment (optional)" : activeTool === "comment" ? "Add comment" : "Add tag"}
            </p>
            {saveError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {saveError}
              </div>
            )}
            <input
              type="text"
              value={pendingContent}
              onChange={(e) => setPendingContent(e.target.value)}
              placeholder={activeTool === "highlight" ? "Your comment…" : activeTool === "comment" ? "Your comment…" : "Tag name…"}
              className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleContentSubmit();
                if (e.key === "Escape") {
                  setShowContentModal(false);
                  setPendingBox(null);
                  setPendingContent("");
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowContentModal(false);
                  setPendingBox(null);
                  setPendingContent("");
                  setSaveError(null);
                }}
                className="rounded-lg px-3 py-2 text-sm text-[#6b7280] hover:bg-[#f3f4f6]"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContentSubmit}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
