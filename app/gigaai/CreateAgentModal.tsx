"use client";

import { useState } from "react";
import { X, MessageSquare, Phone, Layers, Folder, FileText, Image, Music, Play } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface CreateAgentModalProps {
  onClose: () => void;
  onCreate: (data: { name: string; modality: "chat" | "voice" | "multi-modal"; description?: string }) => void;
}

export default function CreateAgentModal({ onClose, onCreate }: CreateAgentModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [modality, setModality] = useState<"chat" | "voice" | "multi-modal">("chat");
  const [files, setFiles] = useState<File[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name, modality });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`relative w-full max-w-2xl rounded-2xl border ${colors.border} bg-[#242423] p-8 shadow-2xl`}>
        <button
          onClick={onClose}
          className={`absolute right-4 top-4 p-2 ${colors.hover} rounded-lg transition`}
        >
          <X className={`h-5 w-5 ${colors.iconSecondary}`} />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#242423] flex items-center justify-center">
            </div>
            <h2 className={`text-2xl font-semibold ${colors.text}`}>Create new agent</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Modality Selection - Drift Style */}
          <div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModality("chat")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition ${
                  modality === "chat"
                    ? `${colors.selected} border ${colors.border}`
                    : `${colors.bgTertiary} border ${colors.border} ${colors.hover}`
                }`}
              >
                <MessageSquare className={`h-4 w-4 ${modality === "chat" ? "text-orange-400" : colors.iconSecondary}`} />
                <div className={`text-sm font-medium ${modality === "chat" ? colors.text : colors.textTertiary}`}>
                  Chat
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModality("voice")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition ${
                  modality === "voice"
                    ? `${colors.selected} border ${colors.border}`
                    : `${colors.bgTertiary} border ${colors.border} ${colors.hover}`
                }`}
              >
                <Phone className={`h-4 w-4 ${modality === "voice" ? colors.text : colors.iconSecondary}`} />
                <div className={`text-sm font-medium ${modality === "voice" ? colors.text : colors.textTertiary}`}>
                  Voice
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModality("multi-modal")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition ${
                  modality === "multi-modal"
                    ? `${colors.selected} border ${colors.border}`
                    : `${colors.bgTertiary} border ${colors.border} ${colors.hover}`
                }`}
              >
                <Layers className={`h-4 w-4 ${modality === "multi-modal" ? colors.text : colors.iconSecondary}`} />
                <div className={`text-sm font-medium ${modality === "multi-modal" ? colors.text : colors.textTertiary}`}>
                  Multi-modal
                </div>
              </button>
            </div>
          </div>

          {/* Agent Name */}
          <div>
            <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
              Agent Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter agent name"
              className={`w-full px-4 py-2 rounded-lg border ${colors.border} ${colors.inputBg} ${colors.text} focus:outline-none focus:border-[#3351ff]`}
              required
            />
          </div>

          {/* Training Documents - Drift Style */}
          <div>
            <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
              Add training documents
            </label>
            <p className={`text-xs ${colors.textTertiary} mb-3`}>
              Attach files to give your agent business context
            </p>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`border-2 border-dashed ${colors.borderSecondary} rounded-xl p-8 text-center hover:${colors.border} transition ${colors.bgTertiary}`}
            >
              <input
                type="file"
                id="file-upload"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                {/* File Type Icons - Drift Style */}
                <div className="flex items-center justify-center gap-4 mb-4">
                  <Folder className={`h-6 w-6 ${colors.iconSecondary}`} />
                  <div className={`w-0.5 h-6 ${colors.borderSecondary}`} />
                  <FileText className={`h-6 w-6 ${colors.iconSecondary}`} />
                  <Image className={`h-6 w-6 ${colors.iconSecondary}`} />
                  <Music className={`h-6 w-6 ${colors.iconSecondary}`} />
                  <Play className={`h-6 w-6 ${colors.iconSecondary}`} />
                </div>
                <p className={`text-sm ${colors.textTertiary} mb-1`}>
                  Drag files here or click to browse
                </p>
              </label>
            </div>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((file, idx) => (
                  <div key={idx} className={`flex items-center gap-2 text-sm ${colors.textSecondary}`}>
                    <FileText className={`h-4 w-4 ${colors.iconSecondary}`} />
                    <span>{file.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-6 py-2 rounded-lg border ${colors.border} ${colors.bgTertiary} ${colors.text} ${colors.hover} transition`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-6 py-2 rounded-lg ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white font-medium transition`}
            >
              Create agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

