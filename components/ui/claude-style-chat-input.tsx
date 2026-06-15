"use client";

import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  ArrowUp,
  X,
  FileText,
  Loader2,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

export interface AttachedFile {
  id: string;
  file: File;
  type: string;
  preview: string | null;
  uploadStatus: "pending" | "uploading" | "complete" | "error";
  content?: string;
}

export interface PastedSnippet {
  id: string;
  content: string;
  timestamp: Date;
}

interface ChatInputProps {
  onSendMessage: (data: {
    message: string;
    files: AttachedFile[];
    pastedContent: PastedSnippet[];
  }) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Extra toolbar items rendered between the + button and the send button. */
  toolbarLeft?: React.ReactNode;
  /** Content rendered to the right of the send button. */
  toolbarRight?: React.ReactNode;
}

// ── Helpers ───────────────────────────────────────────────────

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  );
};

// ── File Preview Card ─────────────────────────────────────────

const FilePreviewCard: React.FC<{
  file: AttachedFile;
  onRemove: (id: string) => void;
}> = ({ file, onRemove }) => {
  const isImage = file.type.startsWith("image/") && file.preview;

  return (
    <div className="relative group flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-[var(--rule)] bg-[var(--neu-card)] animate-fade-in transition-all hover:border-[var(--ink-subtle)]">
      {isImage ? (
        <div className="w-full h-full relative">
          <img
            src={file.preview!}
            alt={file.file.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
        </div>
      ) : (
        <div className="w-full h-full p-3 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[var(--canvas-muted)] rounded">
              <FileText className="w-4 h-4 text-[var(--ink-muted)]" />
            </div>
            <span className="text-[10px] font-medium text-[var(--ink-subtle)] uppercase tracking-wider truncate">
              {file.file.name.split(".").pop()}
            </span>
          </div>
          <div className="space-y-0.5">
            <p
              className="text-xs font-medium text-[var(--ink)] truncate"
              title={file.file.name}
            >
              {file.file.name}
            </p>
            <p className="text-[10px] text-[var(--ink-subtle)]">
              {formatFileSize(file.file.size)}
            </p>
          </div>
        </div>
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(file.id)}
        className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Upload spinner */}
      {file.uploadStatus === "uploading" && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        </div>
      )}
    </div>
  );
};

// ── Pasted Content Card ───────────────────────────────────────

const PastedContentCard: React.FC<{
  content: PastedSnippet;
  onRemove: (id: string) => void;
}> = ({ content, onRemove }) => {
  return (
    <div className="relative group flex-shrink-0 w-28 h-28 rounded-xl overflow-hidden border border-[var(--rule)] bg-[var(--neu-card)] animate-fade-in p-3 flex flex-col justify-between">
      <div className="overflow-hidden w-full">
        <p className="text-[10px] text-[var(--ink-subtle)] leading-[1.4] font-mono break-words whitespace-pre-wrap line-clamp-4 select-none">
          {content.content}
        </p>
      </div>

      <div className="flex items-center justify-between w-full mt-2">
        <div className="inline-flex items-center justify-center px-1.5 py-[2px] rounded border border-[var(--rule)] bg-[var(--neu-card)]">
          <span className="text-[9px] font-bold text-[var(--ink-muted)] uppercase tracking-wider font-sans">
            PASTED
          </span>
        </div>
      </div>

      <button
        onClick={() => onRemove(content.id)}
        className="absolute top-2 right-2 p-[3px] bg-[var(--neu-card)] border border-[var(--rule)] rounded-full text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition-colors shadow-sm opacity-0 group-hover:opacity-100"
      >
        <X className="w-2 h-2" />
      </button>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────

const ClaudeStyleChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "How can I help you today?",
  toolbarLeft,
  toolbarRight,
}) => {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [pastedContent, setPastedContent] = useState<PastedSnippet[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-resize textarea ────────────────────────────────────
  // This is the key behavior: the textarea starts at 1 row and
  // grows smoothly up to a max of 384px (about 16 lines),
  // then switches to internal scrolling.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 384) + "px";
  }, [message]);

  // ── File handling ───────────────────────────────────────────
  const handleFiles = useCallback((newFilesList: FileList | File[]) => {
    const newFiles = Array.from(newFilesList).map((file) => {
      const isImage =
        file.type.startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
      return {
        id: Math.random().toString(36).substr(2, 9),
        file,
        type: isImage ? "image/unknown" : file.type || "application/octet-stream",
        preview: isImage ? URL.createObjectURL(file) : null,
        uploadStatus: "pending" as const,
      };
    });

    setFiles((prev) => [...prev, ...newFiles]);

    // Simulate upload completion
    newFiles.forEach((f) => {
      setTimeout(() => {
        setFiles((prev) =>
          prev.map((p) =>
            p.id === f.id ? { ...p, uploadStatus: "complete" as const } : p
          )
        );
      }, 800 + Math.random() * 1000);
    });
  }, []);

  // ── Drag & drop ─────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  // ── Paste handling ──────────────────────────────────────────
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      handleFiles(pastedFiles);
      return;
    }

    // Large text paste -> card
    const text = e.clipboardData.getData("text");
    if (text.length > 300) {
      e.preventDefault();
      const snippet: PastedSnippet = {
        id: Math.random().toString(36).substr(2, 9),
        content: text,
        timestamp: new Date(),
      };
      setPastedContent((prev) => [...prev, snippet]);
    }
  };

  // ── Send ────────────────────────────────────────────────────
  const handleSend = () => {
    if (
      disabled ||
      (!message.trim() && files.length === 0 && pastedContent.length === 0)
    )
      return;
    onSendMessage({ message, files, pastedContent });
    setMessage("");
    setFiles([]);
    setPastedContent([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent =
    message.trim() || files.length > 0 || pastedContent.length > 0;
  const canSend =
    hasContent &&
    !disabled &&
    !files.some((f) => f.uploadStatus === "uploading");

  return (
    <div
      className="relative w-full max-w-2xl mx-auto transition-all duration-300"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Main container -- glass-input grows with content */}
      <div className="glass-input rounded-[16px] md:rounded-[20px] bg-[var(--neu-input)] border border-white/30 border-t-white/50 flex flex-col">
        <div className="flex flex-col px-3 pt-3 pb-2 gap-2">
          {/* Attached files / pasted content */}
          {(files.length > 0 || pastedContent.length > 0) && (
            <div className="flex gap-3 overflow-x-auto pb-2 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {pastedContent.map((content) => (
                <PastedContentCard
                  key={content.id}
                  content={content}
                  onRemove={(id) =>
                    setPastedContent((prev) => prev.filter((c) => c.id !== id))
                  }
                />
              ))}
              {files.map((file) => (
                <FilePreviewCard
                  key={file.id}
                  file={file}
                  onRemove={(id) =>
                    setFiles((prev) => prev.filter((f) => f.id !== id))
                  }
                />
              ))}
            </div>
          )}

          {/* Auto-expanding text area */}
          <div className="relative">
            <div className="max-h-96 w-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] break-words transition-opacity duration-200 min-h-[2.5rem] pl-1">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full bg-transparent border-0 outline-none text-[var(--ink)] text-sm placeholder:text-[var(--ink-subtle)] resize-none overflow-hidden py-0 leading-6 block font-normal antialiased focus:outline-none focus-visible:ring-0"
                rows={1}
                autoFocus
                style={{ minHeight: "1.5em" }}
              />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex gap-2 w-full items-center">
            {/* Left tools */}
            <div className="relative flex-1 flex items-center shrink min-w-0 gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center h-8 w-8 rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink-muted)] transition-colors active:scale-95 disabled:opacity-50"
                disabled={disabled}
                type="button"
                aria-label="Attach files"
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
              </button>
              {toolbarLeft}
            </div>

            {/* Right tools */}
            <div className="flex flex-row items-center min-w-0 gap-1">
              {toolbarRight}
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-[10px] transition-all duration-150",
                  canSend
                    ? "bg-gradient-to-b from-neutral-700 to-black text-white border border-white/30 active:scale-95"
                    : "bg-gradient-to-b from-neutral-600 to-black text-white opacity-40 border border-white/30"
                )}
                type="button"
                aria-label="Send message"
              >
                <ArrowUp className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-[var(--accent-soft)] border-2 border-dashed border-[var(--accent)] rounded-2xl z-50 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none">
          <Archive className="w-10 h-10 text-[var(--accent)] mb-2 animate-bounce" />
          <p className="text-sm text-[var(--accent)] font-medium">
            Drop files to upload
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default ClaudeStyleChatInput;
export { ClaudeStyleChatInput, FilePreviewCard, PastedContentCard };
