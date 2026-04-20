"use client";

// Create-agent modal — name + modality picker + optional training docs.
// Harvey-ized Apr 2026: white card on a subtle scrim, editorial heading,
// pill-style segmented modality buttons (filled for active), dashed
// 1px upload well. No gradient avatar, no purple accent.

import { useState } from "react";
import {
  X,
  MessageSquare,
  Phone,
  Layers,
  FileText,
  Folder,
  Image as ImageIcon,
  Music,
  Play,
  Upload,
  Bot,
} from "lucide-react";

interface CreateAgentModalProps {
  onClose: () => void;
  onCreate: (data: {
    name: string;
    modality: "chat" | "voice" | "multi-modal";
    description?: string;
  }) => void;
}

export default function CreateAgentModal({
  onClose,
  onCreate,
}: CreateAgentModalProps) {
  const [name, setName] = useState("");
  const [modality, setModality] = useState<"chat" | "voice" | "multi-modal">(
    "chat"
  );
  const [files, setFiles] = useState<File[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Give your agent a name so you can find it later.");
      return;
    }
    if (name.trim().length > 60) {
      setNameError("Name must be 60 characters or fewer.");
      return;
    }
    setNameError(null);
    onCreate({ name: name.trim(), modality });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(21, 21, 21, 0.35)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl card-flat"
        style={{ background: "var(--canvas)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-6 py-5"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 flex items-center justify-center"
              style={{
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-card)",
                background: "var(--canvas-subtle)",
                color: "var(--ink-muted)",
              }}
            >
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <div
                className="label-section mb-0.5"
                style={{ color: "var(--ink-subtle)" }}
              >
                New agent
              </div>
              <h2
                className="heading-display"
                style={{ fontSize: 24, color: "var(--ink)" }}
              >
                Create agent
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 transition"
            style={{ color: "var(--ink-muted)", borderRadius: "var(--r-input)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--canvas-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Agent Name */}
          <div>
            <label
              htmlFor="agent-name"
              className="label-section block mb-1.5"
              style={{ color: "var(--ink-muted)" }}
            >
              Agent name
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Front Desk Receptionist"
              autoFocus
              maxLength={60}
              className="w-full px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--canvas)",
                border: `1px solid ${
                  nameError ? "var(--danger)" : "var(--rule)"
                }`,
                borderRadius: "var(--r-input)",
                color: "var(--ink)",
              }}
            />
            {nameError && (
              <p
                className="mt-1.5 text-xs"
                style={{ color: "var(--danger)" }}
              >
                {nameError}
              </p>
            )}
          </div>

          {/* Modality */}
          <div>
            <div
              className="label-section mb-2"
              style={{ color: "var(--ink-muted)" }}
            >
              Agent type
            </div>
            <div className="flex gap-2">
              <ModalityButton
                icon={MessageSquare}
                label="Chat"
                active={modality === "chat"}
                onClick={() => setModality("chat")}
              />
              <ModalityButton
                icon={Phone}
                label="Voice"
                active={modality === "voice"}
                onClick={() => setModality("voice")}
              />
              <ModalityButton
                icon={Layers}
                label="Multi-modal"
                active={modality === "multi-modal"}
                onClick={() => setModality("multi-modal")}
              />
            </div>
          </div>

          {/* Training docs */}
          <div>
            <div
              className="label-section mb-1.5"
              style={{ color: "var(--ink-muted)" }}
            >
              Training documents
            </div>
            <p
              className="text-xs mb-2"
              style={{ color: "var(--ink-subtle)" }}
            >
              Attach files to give your agent business context.
            </p>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="px-6 py-8 text-center"
              style={{
                border: "1px dashed var(--rule-strong)",
                borderRadius: "var(--r-card)",
                background: "var(--canvas-subtle)",
              }}
            >
              <input
                type="file"
                id="file-upload"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <div className="flex items-center justify-center gap-4 mb-3">
                  <Folder
                    className="h-5 w-5"
                    style={{ color: "var(--ink-subtle)" }}
                  />
                  <div
                    style={{
                      width: 1,
                      height: 20,
                      background: "var(--rule)",
                    }}
                  />
                  <FileText
                    className="h-5 w-5"
                    style={{ color: "var(--ink-subtle)" }}
                  />
                  <ImageIcon
                    className="h-5 w-5"
                    style={{ color: "var(--ink-subtle)" }}
                  />
                  <Music
                    className="h-5 w-5"
                    style={{ color: "var(--ink-subtle)" }}
                  />
                  <Play
                    className="h-5 w-5"
                    style={{ color: "var(--ink-subtle)" }}
                  />
                </div>
                <span
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <Upload className="h-3 w-3" />
                  Drag files here or click to browse
                </span>
              </label>
            </div>

            {files.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs"
                    style={{ color: "var(--ink)" }}
                  >
                    <FileText
                      className="h-3.5 w-3.5"
                      style={{ color: "var(--ink-muted)" }}
                    />
                    <span className="mono truncate">{file.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div
            className="flex items-center justify-end gap-2 pt-1"
          >
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs transition"
              style={{
                background: "var(--canvas)",
                color: "var(--ink)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-input)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs transition"
              style={{
                background: "var(--ink)",
                color: "var(--canvas)",
                borderRadius: "var(--r-input)",
                fontWeight: 500,
              }}
            >
              Create agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalityButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 text-xs transition"
      style={{
        background: active ? "var(--ink)" : "var(--canvas)",
        color: active ? "var(--canvas)" : "var(--ink-muted)",
        border: `1px solid ${active ? "var(--ink)" : "var(--rule)"}`,
        borderRadius: "var(--r-input)",
        fontWeight: active ? 500 : 400,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
