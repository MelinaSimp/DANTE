"use client";

import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  ArrowUp,
  X,
  FileText,
  ImageIcon,
  Video,
  Music,
  Archive,
  Loader2,
  AlertCircle,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

export interface FileWithPreview {
  id: string;
  file: File;
  preview?: string;
  type: string;
  uploadStatus: "pending" | "uploading" | "complete" | "error";
  uploadProgress?: number;
  abortController?: AbortController;
  textContent?: string;
}

export interface PastedContent {
  id: string;
  content: string;
  timestamp: Date;
  wordCount: number;
}

interface ChatInputProps {
  onSendMessage?: (
    message: string,
    files: FileWithPreview[],
    pastedContent: PastedContent[]
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  maxFiles?: number;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  /** Extra toolbar items rendered between the + button and the send button. */
  toolbarLeft?: React.ReactNode;
  /** Content rendered to the right of the send button. */
  toolbarRight?: React.ReactNode;
}

// ── Constants ─────────────────────────────────────────────────

const MAX_FILES = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const PASTE_THRESHOLD = 200;

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

const getFileTypeLabel = (type: string): string => {
  const parts = type.split("/");
  let label = parts[parts.length - 1].toUpperCase();
  if (label.length > 7 && label.includes("-")) {
    label = label.substring(0, label.indexOf("-"));
  }
  if (label.length > 10) label = label.substring(0, 10) + "...";
  return label;
};

const isTextualFile = (file: File): boolean => {
  const textualTypes = [
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
  ];
  const textualExtensions = [
    "txt","md","py","js","ts","jsx","tsx","html","htm","css","scss",
    "sass","json","xml","yaml","yml","csv","sql","sh","bash","php",
    "rb","go","java","c","cpp","h","hpp","cs","rs","swift","kt",
    "scala","r","vue","svelte","astro","config","conf","ini","toml",
    "log","gitignore","dockerfile","makefile","readme",
  ];
  const isTextualMimeType = textualTypes.some((type) =>
    file.type.toLowerCase().startsWith(type)
  );
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const isTextualExtension =
    textualExtensions.includes(extension) ||
    file.name.toLowerCase().includes("readme") ||
    file.name.toLowerCase().includes("dockerfile") ||
    file.name.toLowerCase().includes("makefile");
  return isTextualMimeType || isTextualExtension;
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || "");
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
};

const getFileExtension = (filename: string): string => {
  const extension = filename.split(".").pop()?.toUpperCase() || "FILE";
  return extension.length > 8 ? extension.substring(0, 8) + "..." : extension;
};

// ── File Preview Card ─────────────────────────────────────────

const FilePreviewCard: React.FC<{
  file: FileWithPreview;
  onRemove: (id: string) => void;
}> = ({ file, onRemove }) => {
  const isImage = file.type.startsWith("image/");
  const isTextual = isTextualFile(file.file);

  if (isTextual) {
    return <TextualFilePreviewCard file={file} onRemove={onRemove} />;
  }

  return (
    <div
      className={cn(
        "relative group bg-[var(--neu-card)] border border-[var(--rule)] rounded-lg size-[100px] flex-shrink-0 overflow-hidden",
        isImage ? "p-0" : "p-2.5"
      )}
    >
      {isImage && file.preview ? (
        <img
          src={file.preview}
          alt={file.file.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex-1 min-w-0 overflow-hidden h-full">
          <p
            className="text-[10px] font-medium text-[var(--ink)] truncate"
            title={file.file.name}
          >
            {file.file.name}
          </p>
          <p className="text-[9px] text-[var(--ink-subtle)] mt-0.5">
            {formatFileSize(file.file.size)}
          </p>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--neu-input)] flex items-end p-2 pointer-events-none">
        <span className="text-[10px] bg-[var(--canvas-muted)] border border-[var(--rule)] px-1.5 py-0.5 rounded text-[var(--ink-muted)]">
          {getFileTypeLabel(file.type)}
        </span>
        {file.uploadStatus === "uploading" && (
          <Loader2 className="absolute top-2 left-2 h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
        )}
        {file.uploadStatus === "error" && (
          <AlertCircle className="absolute top-2 left-2 h-3.5 w-3.5 text-[var(--danger)]" />
        )}
      </div>
      <button
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(file.id)}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

// ── Textual File Preview Card ─────────────────────────────────

const TextualFilePreviewCard: React.FC<{
  file: FileWithPreview;
  onRemove: (id: string) => void;
}> = ({ file, onRemove }) => {
  const fileExtension = getFileExtension(file.file.name);

  return (
    <div className="relative group bg-[var(--neu-card)] border border-[var(--rule)] rounded-lg size-[100px] flex-shrink-0 overflow-hidden p-2">
      <div className="text-[7px] leading-tight text-[var(--ink-muted)] whitespace-pre-wrap break-words overflow-hidden h-full">
        {file.textContent ? (
          file.textContent.slice(0, 200)
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-subtle)]" />
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--neu-input)] flex items-end p-2 pointer-events-none">
        <span className="text-[10px] bg-[var(--canvas-muted)] border border-[var(--rule)] px-1.5 py-0.5 rounded text-[var(--ink-muted)]">
          {fileExtension}
        </span>
      </div>
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {file.textContent && (
          <button
            className="w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
            onClick={() => navigator.clipboard.writeText(file.textContent || "")}
            title="Copy content"
          >
            <Copy className="w-2.5 h-2.5" />
          </button>
        )}
        <button
          className="w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
          onClick={() => onRemove(file.id)}
          title="Remove file"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};

// ── Pasted Content Card ───────────────────────────────────────

const PastedContentCard: React.FC<{
  content: PastedContent;
  onRemove: (id: string) => void;
}> = ({ content, onRemove }) => {
  const previewText = content.content.slice(0, 150);
  const needsTruncation = content.content.length > 150;

  return (
    <div className="relative group bg-[var(--neu-card)] border border-[var(--rule)] rounded-lg size-[100px] flex-shrink-0 overflow-hidden p-2">
      <div className="text-[7px] leading-tight text-[var(--ink-muted)] whitespace-pre-wrap break-words overflow-hidden h-full">
        {needsTruncation ? previewText + "..." : content.content}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--neu-input)] flex items-end p-2 pointer-events-none">
        <span className="text-[10px] bg-[var(--canvas-muted)] border border-[var(--rule)] px-1.5 py-0.5 rounded text-[var(--ink-muted)]">
          PASTED
        </span>
      </div>
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
          onClick={() => navigator.clipboard.writeText(content.content)}
          title="Copy content"
        >
          <Copy className="w-2.5 h-2.5" />
        </button>
        <button
          className="w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
          onClick={() => onRemove(content.id)}
          title="Remove content"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────

const ClaudeChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "How can I help you today?",
  maxFiles = MAX_FILES,
  maxFileSize = MAX_FILE_SIZE,
  acceptedFileTypes,
  toolbarLeft,
  toolbarRight,
}) => {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [pastedContent, setPastedContent] = useState<PastedContent[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxHeight =
        Number.parseInt(getComputedStyle(textareaRef.current).maxHeight, 10) ||
        120;
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        maxHeight
      )}px`;
    }
  }, [message]);

  const handleFileSelect = useCallback(
    (selectedFiles: FileList | null) => {
      if (!selectedFiles) return;
      const currentFileCount = files.length;
      if (currentFileCount >= maxFiles) return;

      const availableSlots = maxFiles - currentFileCount;
      const filesToAdd = Array.from(selectedFiles).slice(0, availableSlots);

      const newFiles = filesToAdd
        .filter((file) => {
          if (file.size > maxFileSize) return false;
          if (
            acceptedFileTypes &&
            !acceptedFileTypes.some(
              (type) =>
                file.type.includes(type) || type === file.name.split(".").pop()
            )
          )
            return false;
          return true;
        })
        .map((file) => ({
          id: String(Math.random()),
          file,
          preview: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
          type: file.type || "application/octet-stream",
          uploadStatus: "pending" as const,
          uploadProgress: 0,
        }));

      setFiles((prev) => [...prev, ...newFiles]);

      newFiles.forEach((fileToUpload) => {
        if (isTextualFile(fileToUpload.file)) {
          readFileAsText(fileToUpload.file)
            .then((textContent) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileToUpload.id ? { ...f, textContent } : f
                )
              );
            })
            .catch(() => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileToUpload.id
                    ? { ...f, textContent: "Error reading file content" }
                    : f
                )
              );
            });
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileToUpload.id ? { ...f, uploadStatus: "uploading" } : f
          )
        );

        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 20 + 5;
          if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileToUpload.id
                  ? { ...f, uploadStatus: "complete", uploadProgress: 100 }
                  : f
              )
            );
          } else {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileToUpload.id
                  ? { ...f, uploadProgress: progress }
                  : f
              )
            );
          }
        }, 150);
      });
    },
    [files.length, maxFiles, maxFileSize, acceptedFileTypes]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      if (fileToRemove?.preview) URL.revokeObjectURL(fileToRemove.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = e.clipboardData;
      const items = clipboardData.items;

      const fileItems = Array.from(items).filter(
        (item) => item.kind === "file"
      );
      if (fileItems.length > 0 && files.length < maxFiles) {
        e.preventDefault();
        const pastedFiles = fileItems
          .map((item) => item.getAsFile())
          .filter(Boolean) as File[];
        const dataTransfer = new DataTransfer();
        pastedFiles.forEach((file) => dataTransfer.items.add(file));
        handleFileSelect(dataTransfer.files);
        return;
      }

      const textData = clipboardData.getData("text");
      if (
        textData &&
        textData.length > PASTE_THRESHOLD &&
        pastedContent.length < 5
      ) {
        e.preventDefault();
        setMessage((prev) => prev + textData.slice(0, PASTE_THRESHOLD) + "...");
        const pastedItem: PastedContent = {
          id: String(Math.random()),
          content: textData,
          timestamp: new Date(),
          wordCount: textData.split(/\s+/).filter(Boolean).length,
        };
        setPastedContent((prev) => [...prev, pastedItem]);
      }
    },
    [handleFileSelect, files.length, maxFiles, pastedContent.length]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files) handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleSend = useCallback(() => {
    if (
      disabled ||
      (!message.trim() && files.length === 0 && pastedContent.length === 0)
    )
      return;
    if (files.some((f) => f.uploadStatus === "uploading")) return;

    onSendMessage?.(message, files, pastedContent);
    setMessage("");
    files.forEach((file) => {
      if (file.preview) URL.revokeObjectURL(file.preview);
    });
    setFiles([]);
    setPastedContent([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [message, files, pastedContent, disabled, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const hasContent =
    message.trim() || files.length > 0 || pastedContent.length > 0;
  const canSend =
    hasContent &&
    !disabled &&
    !files.some((f) => f.uploadStatus === "uploading");

  return (
    <div
      className="relative w-full max-w-2xl mx-auto"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[var(--accent)]/10 border-2 border-dashed border-[var(--accent)] rounded-xl flex items-center justify-center pointer-events-none">
          <p className="text-sm text-[var(--accent)] flex items-center gap-2">
            <ImageIcon className="size-4 opacity-50" />
            Drop files here to add to chat
          </p>
        </div>
      )}

      <div className="glass-input rounded-[16px] md:rounded-[20px] bg-[var(--neu-input)] border border-white/30 border-t-white/50 flex flex-col min-h-[150px]">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-h-[100px] w-full p-4 max-h-[120px] resize-none bg-transparent text-[var(--ink)] outline-none border-none placeholder:text-[var(--ink-subtle)] text-sm leading-6 focus:outline-none focus-visible:ring-0"
          rows={1}
        />
        <div className="flex items-center gap-2 justify-between w-full px-2.5 pb-1.5">
          <div className="flex items-center gap-1">
            <button
              className="flex items-center justify-center h-8 w-8 rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink-muted)] transition-colors disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || files.length >= maxFiles}
              title={
                files.length >= maxFiles
                  ? `Max ${maxFiles} files reached`
                  : "Attach files"
              }
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
            </button>
            {toolbarLeft}
          </div>
          <div className="flex items-center gap-2">
            {toolbarRight}
            <button
              className={cn(
                "h-8 w-8 flex items-center justify-center rounded-[10px] transition-all duration-150",
                canSend
                  ? "bg-gradient-to-b from-neutral-700 to-black text-white border border-white/30 active:scale-95"
                  : "bg-gradient-to-b from-neutral-600 to-black text-white opacity-40 border border-white/30"
              )}
              onClick={handleSend}
              disabled={!canSend}
              title="Send message"
            >
              <ArrowUp className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>

        {(files.length > 0 || pastedContent.length > 0) && (
          <div className="overflow-x-auto border-t border-[var(--rule)] p-3 bg-[var(--canvas-muted)] rounded-b-[16px] md:rounded-b-[20px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex gap-2.5">
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
                  onRemove={removeFile}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={acceptedFileTypes?.join(",")}
        onChange={(e) => {
          handleFileSelect(e.target.files);
          if (e.target) e.target.value = "";
        }}
      />
    </div>
  );
};

export default ClaudeChatInput;
export { ClaudeChatInput, FilePreviewCard, PastedContentCard };
