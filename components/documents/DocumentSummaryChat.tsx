"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, FileDown } from "lucide-react";
import ChartRenderer from "@/components/charts/ChartRenderer";

interface DocumentSummaryChatProps {
  contactId: string;
  clientName: string;
  /** When provided, these PDF pages are rendered as images and sent to the LLM so it can extract charts and tables. */
  documentUrl?: string | null;
  /** Page numbers that have annotations (only these pages are sent as images). */
  annotatedPageNumbers?: number[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  chartData?: {
    type: "line" | "bar" | "pie" | "area";
    data: unknown[];
    xKey: string;
    yKey: string;
    title?: string;
  };
}

export default function DocumentSummaryChat({
  contactId,
  clientName,
  documentUrl,
  annotatedPageNumbers = [],
}: DocumentSummaryChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Render PDF pages to JPEG base64 for the LLM to extract charts/tables. */
  async function renderPdfPagesToImages(
    url: string,
    pageNumbers: number[]
  ): Promise<{ imageBase64: string; type: string; name: string }[]> {
    const pdfjs = (await import("react-pdf")).pdfjs;
    const pdf = await pdfjs.getDocument(url).promise;
    const out: { imageBase64: string; type: string; name: string }[] = [];
    for (const pageNum of pageNumbers) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      out.push({ imageBase64: base64, type: "image/jpeg", name: `page-${pageNum}.jpg` });
    }
    return out;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      let images: { imageBase64: string; type: string; name: string }[] = [];
      if (documentUrl && annotatedPageNumbers.length > 0) {
        try {
          images = await renderPdfPagesToImages(documentUrl, annotatedPageNumbers);
        } catch (err) {
          console.warn("Could not render PDF pages for summary:", err);
        }
      }

      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-6),
          contactId,
          ...(images.length > 0 && { images }),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to get response");
      }

      const data = await res.json();
      const content = data.message || data.content || "";

      let chartData: Message["chartData"];
      const match = content.match(/<!--CHART_DATA-->([\s\S]*?)<!--\/CHART_DATA-->/);
      if (match) {
        try {
          const json = JSON.parse(match[1].trim());
          if (json.chart) chartData = json.chart;
        } catch {}
      }

      const cleanContent = content.replace(/<!--CHART_DATA-->[\s\S]*?<!--\/CHART_DATA-->/g, "").trim();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: cleanContent || "I couldn't generate a response.",
          chartData,
        },
      ]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const downloadLastSummaryAsPDF = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content) return;
    const { jsPDF } = require("jspdf");
    const doc = new jsPDF({ format: "a4", unit: "mm" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 18;
    const maxW = pageW - margin * 2;
    let y = 20;

    // Strip markdown to plain text (keep line breaks and structure)
    const raw = lastAssistant.content
      .replace(/^#+\s*/gm, "\n")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/^-\s+/gm, "• ")
      .replace(/^---$/gm, "")
      .trim();
    const lines = doc.splitTextToSize(raw, maxW);

    for (const line of lines) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(line, margin, y);
      y += 6;
    }

    const filename = `one-page-summary-${clientName.replace(/\s+/g, "-")}.pdf`;
    doc.save(filename);
  };

  const canDownloadPdf = messages.some((m) => m.role === "assistant");

  return (
    <div className="mt-4 p-4 border-t border-[#e5e7eb] bg-[#f9fafb] rounded-b-xl">
      <p className="text-xs font-medium text-[#6b7280] mb-3">
        Ask the AI to generate a one-page summary with charts. The annotated PDF for {clientName} is used as a template.
      </p>
      <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-[#e5e7eb] text-[#374151]"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.chartData && (
                <div className="mt-3 h-48">
                  <ChartRenderer data={m.chartData} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3 py-2 bg-white border border-[#e5e7eb]">
              <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {canDownloadPdf && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={downloadLastSummaryAsPDF}
            className="inline-flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]"
          >
            <FileDown className="h-4 w-4" />
            Download as PDF
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Generate a one-page summary with charts"
          className="flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </button>
      </form>
    </div>
  );
}
