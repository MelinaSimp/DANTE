"use client";

// app/dante/DocumentPanel.tsx
//
// Side-drawer editor for assistant outputs that look like drafts
// (emails, memos, briefs). Inspired by Harvey's split-view: chat on
// the left, polished editable document on the right.
//
// MVP scope:
//   - Editable textarea, plain text. No rich formatting yet — the
//     vast majority of drafts are markdown that already renders
//     fine when copied into Gmail/Outlook.
//   - Copy to clipboard.
//   - Download as .md file.
//   - Close button.
//
// Deferred:
//   - "Show edits" / revision tracking (would need a diff view + per-
//     paragraph version stack — Harvey has this but it's a chunkier
//     lift than fits this commit).
//   - "Send via Resend" — would need a recipient picker and a
//     compliance check before letting the chat surface fire mail
//     directly. Better to keep the manual copy step for now.
//   - Side-by-side layout. Fixed-position drawer is simpler and works
//     responsively without restructuring the chat layout.

import { useEffect, useRef, useState } from "react";
import { Copy, Download, X, Check, FileText } from "lucide-react";

interface Props {
  initialContent: string;
  /** Suggested filename stem; we'll append .md. Defaults to "draft". */
  filenameStem?: string;
  onClose: () => void;
}

export default function DocumentPanel({
  initialContent,
  filenameStem,
  onClose,
}: Props) {
  const [content, setContent] = useState(initialContent);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset internal state when the source draft changes (e.g. user
  // re-runs the prompt — we want the new draft, not the stale edit).
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // Esc to close — common drawer pattern.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard can fail in some sandboxes — quietly noop */
    }
  };

  const onDownload = () => {
    const stem = (filenameStem || "draft").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stem}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full md:w-[55%] max-w-[820px] bg-[var(--canvas)] border-l border-[var(--rule)] shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--rule)]">
          <div className="flex items-center gap-2 text-sm text-[var(--ink)] font-medium">
            <FileText className="w-4 h-4" strokeWidth={1.5} />
            Document
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2.5 py-1 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-300" strokeWidth={1.5} />
              ) : (
                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2.5 py-1 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
              title="Download as Markdown"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              Download
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
              title="Close (Esc)"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Editor */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={true}
          className="flex-1 w-full resize-none bg-[var(--canvas)] px-6 py-5 text-sm leading-relaxed text-[var(--ink)] focus:outline-none font-serif"
        />

        {/* Footer hint */}
        <div className="px-5 py-2 border-t border-[var(--rule)] text-[11px] text-[var(--ink-subtle)]">
          Edits stay local — Copy or Download to send.
        </div>
      </div>
    </div>
  );
}

// Heuristic: does this assistant content look like a draft worth
// opening in the editor? Used by AskDante and ChatThread to decide
// whether to surface the "Open in editor" button.
//
// We tuned the thresholds against the seeded skills' typical output
// (draft_review_meeting_recap, prep_briefing_for_meeting). False
// positives are cheap (the button just opens a drawer with prose);
// false negatives mean the user has to copy-paste manually.
export function looksLikeDraft(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();

  // Email-shaped content.
  if (/^subject:/im.test(trimmed)) return true;
  if (/^(dear|hi|hello)\s+[A-Z]/im.test(trimmed)) return true;

  // Memo-shaped: 2+ markdown headers + reasonable length.
  const headerCount = (trimmed.match(/^#{1,3}\s+/gm) || []).length;
  if (headerCount >= 2 && trimmed.length > 300) return true;

  // Long-prose threshold — anything over ~600 chars that's mostly
  // narrative (low ratio of citation markers and bullet starts).
  if (trimmed.length > 600) {
    const bulletOrCite = (trimmed.match(/^[-*•]\s|\[v\d+\]|\[mem:/gm) || []).length;
    const lineCount = trimmed.split("\n").filter((l) => l.trim()).length;
    if (bulletOrCite < lineCount * 0.5) return true;
  }

  return false;
}

// Try to extract a sensible filename stem from the content.
// Subject lines, "Re: ..." patterns, and the first markdown header
// all work; otherwise fall back to "draft".
export function deriveFilenameStem(content: string): string {
  const subj = content.match(/^subject:\s*(.+)$/im);
  if (subj) return subj[1].trim().slice(0, 60);
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim().slice(0, 60);
  return "draft";
}
