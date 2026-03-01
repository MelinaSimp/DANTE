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
  /** When in "use template" flow: template id and name for the LLM to use structure/sections. */
  templateId?: string;
  templateName?: string;
  /** Template's source document id – used to load template annotations (table vs paragraph) for the LLM. */
  templateDocumentId?: string;
}

interface ChartDataItem {
  type: "line" | "bar" | "pie" | "area";
  data: unknown[];
  xKey: string;
  yKey: string;
  title?: string;
  colors?: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  chartData?: ChartDataItem;
  charts?: ChartDataItem[];
}

export default function DocumentSummaryChat({
  contactId,
  clientName,
  documentUrl,
  annotatedPageNumbers = [],
  templateId,
  templateName,
  templateDocumentId,
}: DocumentSummaryChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastChartRef = useRef<HTMLDivElement | null>(null);
  const allChartRefs = useRef<HTMLDivElement[]>([]);
  const lastSummaryPageImagesRef = useRef<{ imageBase64: string; name: string }[]>([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Resolve PDF URL: use proxy for Supabase storage URLs to avoid CORS. */
  function getPdfLoadUrl(url: string): string {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const isSupabaseStorage =
      (supabaseUrl && url.startsWith(supabaseUrl.replace(/\/$/, "") + "/storage/")) ||
      url.includes("/storage/v1/object/");
    if (isSupabaseStorage && typeof window !== "undefined") {
      const base = window.location.origin;
      return `${base}/api/documents/proxy-pdf?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  /** Ensure pdf.js worker is configured. react-pdf sets default 'pdf.worker.mjs' (invalid bare specifier) - must override. */
  function ensurePdfWorker(pdfjs: typeof import("react-pdf").pdfjs) {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const validUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/pdf.worker.min.mjs` : "/pdf.worker.min.mjs";
    if (!pdfjs.GlobalWorkerOptions.workerSrc || !pdfjs.GlobalWorkerOptions.workerSrc.startsWith("http")) {
      pdfjs.GlobalWorkerOptions.workerSrc = validUrl;
    }
  }

  /** Extract text from PDF pages using pdf.js getTextContent. Only extracts specified pages. */
  async function extractTextFromPdfPages(
    url: string,
    pageNumbers: number[]
  ): Promise<string> {
    const { pdfjs } = await import("react-pdf");
    ensurePdfWorker(pdfjs);
    const loadUrl = getPdfLoadUrl(url);
    const pdf = await pdfjs.getDocument(loadUrl).promise;
    const totalPages = pdf.numPages;
    // Debug logging removed for production

    const parts: string[] = [];
    for (const pageNum of pageNumbers) {
      if (pageNum > totalPages) {
        console.warn(`[extractTextFromPdfPages] Skipping page ${pageNum} (doc only has ${totalPages} pages)`);
        continue;
      }
      try {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ");
        parts.push(`[Page ${pageNum}]\n${pageText}`);
      } catch (err) {
        console.warn(`[extractTextFromPdfPages] Failed to extract page ${pageNum}:`, err);
      }
    }
    return parts.join("\n\n");
  }

  /** Render PDF pages to JPEG base64 for the LLM to extract charts/tables. */
  async function renderPdfPagesToImages(
    url: string,
    pageNumbers: number[]
  ): Promise<{ imageBase64: string; type: string; name: string }[]> {
    const { pdfjs } = await import("react-pdf");
    ensurePdfWorker(pdfjs);
    const loadUrl = getPdfLoadUrl(url);
    const pdf = await pdfjs.getDocument(loadUrl).promise;
    const totalPages = pdf.numPages;
    const out: { imageBase64: string; type: string; name: string }[] = [];
    for (const pageNum of pageNumbers) {
      if (pageNum > totalPages) {
        console.warn(`[renderPdfPagesToImages] Skipping page ${pageNum} (doc only has ${totalPages} pages)`);
        continue;
      }
      try {
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
      } catch (err) {
        console.warn(`[renderPdfPagesToImages] Failed to render page ${pageNum}:`, err);
      }
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
      let extractedTextFromPages = "";
      let extractionError: string | null = null;
      if (documentUrl && annotatedPageNumbers.length > 0) {
        try {
          images = await renderPdfPagesToImages(documentUrl, annotatedPageNumbers);
          extractedTextFromPages = await extractTextFromPdfPages(documentUrl, annotatedPageNumbers);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("Could not render PDF pages for summary:", err);
          extractionError = msg;
        }
      } else if (documentUrl && annotatedPageNumbers.length === 0) {
        extractionError = "No pages configured for extraction (template has no annotated pages).";
      }

      // Sending to LLM with images and extracted text

      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-6),
          contactId,
          ...(images.length > 0 && { images }),
          ...(extractedTextFromPages && { extractedTextFromPages }),
          ...(templateId && { templateId }),
          ...(templateName && { templateName }),
          ...(templateDocumentId && { templateDocumentId }),
        }),
      });

      // If extraction failed and we have no content, show the real error instead of calling the LLM
      if (extractionError && !extractedTextFromPages && images.length === 0 && templateName) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Could not load the PDF for analysis: ${extractionError}\n\nPlease try re-uploading the document, or check the browser console (F12) for more details.`,
          },
        ]);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to get response");
      }

      const data = await res.json();
      const content = data.message || data.content || "";
      // Response received from LLM

      // Extract ALL chart data blocks
      const charts: ChartDataItem[] = [];
      const chartRegex = /<!--\s*CHART_DATA\s*-->([\s\S]*?)<!--\s*\/?\s*CHART_DATA\s*-->/gi;
      let chartMatch;
      while ((chartMatch = chartRegex.exec(content)) !== null) {
        try {
          const json = JSON.parse(chartMatch[1].trim());
          if (json.chart) charts.push(json.chart);
        } catch {}
      }
      const chartData = charts.length > 0 ? charts[0] : undefined;

      const cleanContent = content
        .replace(/<!--\s*CHART_DATA\s*-->[\s\S]*?<!--\s*\/?\s*CHART_DATA\s*-->/gi, "")
        .replace(/<!--\s*CHART_DATA\s*-->[\s\S]*/gi, "")
        .trim();

      if (images.length > 0) {
        lastSummaryPageImagesRef.current = images.map((img) => ({
          imageBase64: img.imageBase64,
          name: img.name,
        }));
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: cleanContent || "I couldn't generate a response.",
          chartData,
          charts: charts.length > 0 ? charts : undefined,
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

  const downloadLastSummaryAsPDF = async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content) return;
    const { jsPDF } = require("jspdf");
    const doc = new jsPDF({ format: "a4", unit: "mm" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;

    // Colors
    const PRIMARY = [30, 64, 175]; // blue-800
    const ACCENT = [59, 130, 246]; // blue-500
    const DARK = [31, 41, 55]; // gray-800
    const MUTED = [107, 114, 128]; // gray-500
    const LIGHT_BG = [243, 244, 246]; // gray-100
    const WHITE = [255, 255, 255];

    // Strip chart data from text
    const cleaned = lastAssistant.content
      .replace(/<!--\s*CHART_DATA\s*-->[\s\S]*?<!--\s*\/?\s*CHART_DATA\s*-->/gi, "")
      .replace(/<!--\s*CHART_DATA\s*-->[\s\S]*/gi, "")
      .trim();

    // Parse into sections: split on markdown headings or bold lines
    // Match headings like "# Title", "## Title", "### Title", "#### Title" or "**Title**"
    // Supports headings at start, after newline, and at end of content (no trailing \n required)
    const sectionRegex = /(?:^|\n)(#{1,4})\s+(.+?)(?:\n|$)|(?:^|\n)\*\*(.+?)\*\*(?:\n|$)/g;
    const sections: { title: string; body: string }[] = [];
    let match;
    const headings: { title: string; idx: number }[] = [];
    while ((match = sectionRegex.exec(cleaned)) !== null) {
      const rawTitle = (match[2] || match[3] || "").trim();
      // Strip any residual # or ** from the title
      const title = rawTitle.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
      headings.push({ title, idx: match.index });
    }
    if (headings.length === 0) {
      // No headings found — treat entire content as one section
      sections.push({ title: "", body: cleaned });
    } else {
      // Text before first heading
      const preamble = cleaned.substring(0, headings[0].idx).trim();
      if (preamble) sections.push({ title: "", body: preamble });
      for (let i = 0; i < headings.length; i++) {
        const start = headings[i].idx + (cleaned.substring(headings[i].idx).match(/^[^\n]*\n/)?.length ?? 0) + headings[i].idx;
        const bodyStart = cleaned.indexOf("\n", headings[i].idx) + 1;
        const bodyEnd = i + 1 < headings.length ? headings[i + 1].idx : cleaned.length;
        const body = cleaned.substring(bodyStart, bodyEnd).trim();
        sections.push({ title: headings[i].title, body });
      }
    }

    // Helper: clean markdown from body text
    const cleanBody = (text: string) =>
      text
        .replace(/^#{1,6}\s+.*/gm, "") // remove markdown headings inside body
        .replace(/!\[.*?\]\(.*?\)/g, "") // remove markdown images ![alt](url)
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/^-\s+/gm, "• ")
        .replace(/^---+$/gm, "") // remove horizontal rules
        .replace(/^\|.*\|$/gm, (row) => {
          // Convert markdown table rows to readable format
          if (/^[\s|:-]+$/.test(row)) return ""; // skip separator rows
          return row.replace(/\|/g, "  ").trim();
        })
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    // Helper: ensure we have space, add page if not
    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - 12) {
        doc.addPage();
        y = 12;
      }
    };

    let y = 0;

    // === HEADER BAR ===
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setFontSize(18);
    doc.setTextColor(...WHITE);
    const headerTitle = sections[0]?.title || "One Page Summary";
    const displayTitle = sections[0]?.title ? headerTitle : "One Page Summary";
    doc.text(displayTitle, margin, 16);
    doc.setFontSize(9);
    doc.setTextColor(200, 210, 255);
    doc.text(`${clientName}  •  ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, 23);
    y = 34;

    // If first section was used as header title, skip its body or render it as intro
    let startIdx = 0;
    if (sections[0]?.title && sections[0].title === headerTitle) {
      if (sections[0].body) {
        // Render intro body in a highlighted box
        const introText = cleanBody(sections[0].body);
        const introLines = doc.splitTextToSize(introText, contentW - 10);
        const boxH = Math.min(introLines.length * 4.5 + 8, 50);
        doc.setFillColor(...LIGHT_BG);
        doc.roundedRect(margin, y, contentW, boxH, 2, 2, "F");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(introLines, margin + 5, y + 6);
        y += boxH + 4;
      }
      startIdx = 1;
    }

    // === RENDER SECTIONS (Two-Column Layout) ===
    const remainingSections = sections.slice(startIdx);
    const colGap = 8;
    const colW = (contentW - colGap) / 2;

    // Pre-calculate section heights to plan layout
    interface SectionInfo { title: string; body: string; bodyLines: string[]; height: number; }
    const sectionInfos: SectionInfo[] = [];
    for (const sec of remainingSections) {
      const body = cleanBody(sec.body);
      if (!body && !sec.title) continue;
      const bodyLines = doc.splitTextToSize(body, colW - 6);
      const height = (sec.title ? 10 : 0) + bodyLines.length * 3.8 + 5;
      sectionInfos.push({ title: sec.title, body, bodyLines, height });
    }

    // Two-column rendering
    let leftY = y;
    let rightY = y;

    const renderSection = (info: SectionInfo, xBase: number, curY: number): number => {
      let sy = curY;

      // Section title with accent bar
      if (info.title) {
        doc.setFillColor(...ACCENT);
        doc.rect(xBase, sy, 1.5, 5, "F");
        doc.setFontSize(9.5);
        doc.setTextColor(...PRIMARY);
        doc.text(info.title, xBase + 4, sy + 3.8);
        sy += 8;
      }

      // Section body
      doc.setFontSize(8);
      doc.setTextColor(...DARK);
      for (const line of info.bodyLines) {
        if (sy > pageH - 14) {
          doc.addPage();
          sy = 12;
        }
        const indent = line.startsWith("•") ? xBase + 3 : xBase + 2;
        doc.text(line, indent, sy);
        sy += 3.8;
      }
      sy += 3;
      return sy;
    };

    const leftX = margin;
    const rightX = margin + colW + colGap;

    for (const info of sectionInfos) {
      // Place section in the shorter column
      if (leftY <= rightY) {
        if (leftY + Math.min(info.height, 50) > pageH - 14) {
          doc.addPage();
          leftY = 12;
          rightY = 12;
        }
        leftY = renderSection(info, leftX, leftY);
      } else {
        if (rightY + Math.min(info.height, 50) > pageH - 14) {
          doc.addPage();
          leftY = 12;
          rightY = 12;
        }
        rightY = renderSection(info, rightX, rightY);
      }
    }

    y = Math.max(leftY, rightY) + 2;

    // === CHARTS (drawn programmatically from chart data) ===
    const chartsToRender = (lastAssistant.charts || (lastAssistant.chartData ? [lastAssistant.chartData] : [])).filter(
      (c) => c && c.data && c.data.length > 0
    );
    const DEFAULT_CHART_COLORS: [number, number, number][] = [
      [59, 130, 246],   // blue
      [16, 185, 129],   // green
      [245, 158, 11],   // amber
      [239, 68, 68],    // red
      [139, 92, 246],   // purple
      [236, 72, 153],   // pink
      [20, 184, 166],   // teal
      [249, 115, 22],   // orange
    ];

    function hexToRgb(hex: string): [number, number, number] {
      const h = hex.replace("#", "");
      return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
    }

    function getChartColors(chart: ChartDataItem): [number, number, number][] {
      if (chart.colors && chart.colors.length > 0) {
        return chart.colors.map(hexToRgb);
      }
      return DEFAULT_CHART_COLORS;
    }

    /** Draw a single chart at the given (xOff, yOff) with the given available width. Returns the height used. */
    const drawChart = (chart: ChartDataItem, xOff: number, availW: number, yOff: number): number => {
      const CHART_COLORS = getChartColors(chart);
      const items = chart.data as { x?: string; y?: number; [k: string]: unknown }[];
      const xKey = chart.xKey || "x";
      const yKey = chart.yKey || "y";
      let cy = yOff;

      // Chart title
      if (chart.title) {
        doc.setFillColor(...ACCENT);
        doc.rect(xOff, cy, 1.5, 5, "F");
        doc.setFontSize(9);
        doc.setTextColor(...PRIMARY);
        const titleLines = doc.splitTextToSize(chart.title, availW - 8);
        doc.text(titleLines[0], xOff + 4, cy + 3.8);
        cy += 8;
      }

      if (chart.type === "pie") {
        const total = items.reduce((s, d) => s + (Number(d[yKey]) || 0), 0);
        if (total <= 0) return cy - yOff;
        const radius = Math.min(availW * 0.2, 22);
        const pieH = radius * 2 + 8;
        const cx = xOff + radius + 4;
        const pieCenter = cy + radius + 2;
        let startAngle = -Math.PI / 2;

        for (let i = 0; i < items.length; i++) {
          const val = Number(items[i][yKey]) || 0;
          const sliceAngle = (val / total) * 2 * Math.PI;
          const color = CHART_COLORS[i % CHART_COLORS.length];
          const steps = Math.max(Math.ceil(sliceAngle / 0.05), 4);
          for (let s = 0; s < steps; s++) {
            const a1 = startAngle + (sliceAngle * s) / steps;
            const a2 = startAngle + (sliceAngle * (s + 1)) / steps;
            doc.setFillColor(...color);
            doc.triangle(cx, pieCenter, cx + radius * Math.cos(a1), pieCenter + radius * Math.sin(a1), cx + radius * Math.cos(a2), pieCenter + radius * Math.sin(a2), "F");
          }
          startAngle += sliceAngle;
        }

        // Legend
        const legendX = xOff + radius * 2 + 14;
        let legendY = cy + 4;
        doc.setFontSize(7);
        for (let i = 0; i < items.length; i++) {
          const color = CHART_COLORS[i % CHART_COLORS.length];
          const label = String(items[i][xKey] || `Item ${i + 1}`);
          const val = Number(items[i][yKey]) || 0;
          const pct = ((val / total) * 100).toFixed(1);
          doc.setFillColor(...color);
          doc.rect(legendX, legendY - 2, 2.5, 2.5, "F");
          doc.setTextColor(...DARK);
          doc.text(`${label}: ${pct}%`, legendX + 4.5, legendY);
          legendY += 4.5;
        }
        cy += pieH;

      } else if (chart.type === "bar") {
        const values = items.map((d) => Number(d[yKey]) || 0);
        const maxVal = Math.max(...values.map(Math.abs), 1);
        const barAreaH = 42;
        const barAreaW = availW - 6;

        doc.setFillColor(...LIGHT_BG);
        doc.roundedRect(xOff, cy, availW, barAreaH + 10, 2, 2, "F");

        const barCount = items.length;
        const gap = 3;
        const barW = Math.min((barAreaW - gap * (barCount + 1)) / barCount, 24);
        const startX = xOff + (availW - (barW * barCount + gap * (barCount - 1))) / 2;
        const baselineY = cy + barAreaH + 2;

        for (let i = 0; i < barCount; i++) {
          const val = values[i];
          const barH = (Math.abs(val) / maxVal) * (barAreaH - 8);
          const color = CHART_COLORS[i % CHART_COLORS.length];
          const bx = startX + i * (barW + gap);
          const by = val >= 0 ? baselineY - barH : baselineY;
          doc.setFillColor(...color);
          doc.roundedRect(bx, by, barW, barH, 1, 1, "F");
          doc.setFontSize(6);
          doc.setTextColor(...DARK);
          const valText = val % 1 === 0 ? String(val) : val.toFixed(2);
          doc.text(valText, bx + barW / 2, by - 1, { align: "center" });
          doc.setTextColor(...MUTED);
          doc.text(String(items[i][xKey] || ""), bx + barW / 2, baselineY + 4, { align: "center" });
        }
        cy += barAreaH + 14;

      } else {
        // LINE / AREA
        const values = items.map((d) => Number(d[yKey]) || 0);
        const maxVal = Math.max(...values, 1);
        const minVal = Math.min(...values, 0);
        const range = maxVal - minVal || 1;
        const chartH = 38;

        doc.setFillColor(...LIGHT_BG);
        doc.roundedRect(xOff, cy, availW, chartH + 8, 2, 2, "F");

        const plotX = xOff + 6;
        const plotW = availW - 14;
        const plotY = cy + 4;
        const plotH = chartH - 4;

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.1);
        for (let g = 0; g <= 4; g++) {
          const gy = plotY + (plotH * g) / 4;
          doc.line(plotX, gy, plotX + plotW, gy);
        }

        doc.setDrawColor(...ACCENT);
        doc.setLineWidth(0.5);
        const pts: [number, number][] = items.map((d, i) => [
          plotX + (i / Math.max(items.length - 1, 1)) * plotW,
          plotY + plotH - ((Number(d[yKey]) - minVal) / range) * plotH,
        ]);
        for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        for (const [px, py] of pts) { doc.setFillColor(...ACCENT); doc.circle(px, py, 0.7, "F"); }

        doc.setFontSize(5.5);
        doc.setTextColor(...MUTED);
        for (let i = 0; i < items.length; i++) {
          if (items.length <= 10 || i % Math.ceil(items.length / 6) === 0) {
            doc.text(String(items[i][xKey] || ""), pts[i][0], plotY + plotH + 4.5, { align: "center" });
          }
        }
        cy += chartH + 12;
      }

      return cy - yOff;
    };

    // Render charts — side by side if exactly 2, otherwise full width
    if (chartsToRender.length === 2) {
      const chartColW = colW;
      ensureSpace(75);
      const h1 = drawChart(chartsToRender[0], leftX, chartColW, y);
      const h2 = drawChart(chartsToRender[1], rightX, chartColW, y);
      y += Math.max(h1, h2) + 4;
    } else {
      for (const chart of chartsToRender) {
        ensureSpace(65);
        const h = drawChart(chart, margin, contentW, y);
        y += h + 4;
      }
    }

    // === FOOTER ===
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFillColor(...PRIMARY);
      doc.rect(0, pageH - 8, pageW, 8, "F");
      doc.setFontSize(7);
      doc.setTextColor(...WHITE);
      doc.text("Generated by Drift AI", margin, pageH - 3);
      doc.text(`Page ${p} of ${totalPages}`, pageW - margin - 20, pageH - 3);
    }

    const filename = `one-page-summary-${clientName.replace(/\s+/g, "-")}.pdf`;
    doc.save(filename);
  };

  const canDownloadPdf = messages.some((m) => m.role === "assistant");

  return (
    <div className="mt-4 p-4 border-t border-[#e5e7eb] bg-[#f9fafb] rounded-b-xl">
      <p className="text-xs font-medium text-[#6b7280] mb-3">
        {templateName
          ? `Using template "${templateName}". Upload a document to analyze above, then ask the AI to generate (e.g. one-page summary with charts).`
          : "Ask the AI to generate a one-page summary with charts. You can save this document as a template above to reuse its structure for other documents."}
      </p>
      <div ref={messagesContainerRef} className="space-y-3 min-h-[200px] max-h-[420px] overflow-y-auto mb-3">
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
              {/* Render ALL charts for this message */}
              {(m.charts && m.charts.length > 0 ? m.charts : m.chartData ? [m.chartData] : []).map((chart, ci) => (
                <div
                  key={ci}
                  ref={
                    i === messages.length - 1 && m.role === "assistant"
                      ? (el) => {
                          if (el) {
                            if (ci === 0) {
                              allChartRefs.current = [];
                              lastChartRef.current = el;
                            }
                            allChartRefs.current[ci] = el;
                          }
                        }
                      : undefined
                  }
                  className="mt-3"
                  style={{ minHeight: 360 }}
                >
                  <ChartRenderer chartData={chart} />
                </div>
              ))}
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
            className="inline-flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]"
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
          className="flex-1 rounded-xl border border-[#e5e7eb] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </button>
      </form>
    </div>
  );
}
