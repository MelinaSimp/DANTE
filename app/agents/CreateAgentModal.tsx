"use client";

import { useState } from "react";
import { X, MessageSquare, Phone, Layers, Upload, FileText, Folder, Image, Music, Play } from "lucide-react";

interface CreateAgentModalProps {
  onClose: () => void;
  onCreate: (data: { name: string; modality: "chat" | "voice" | "multi-modal"; description?: string }) => void;
}

export default function CreateAgentModal({ onClose, onCreate }: CreateAgentModalProps) {
  const [name, setName] = useState("");
  const [modality, setModality] = useState<"chat" | "voice" | "multi-modal">("chat");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name, modality, description: description || undefined });
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
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[#1a1612]/95 backdrop-blur p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 hover:bg-white/5 rounded-full transition"
        >
          <X className="h-5 w-5 text-white/60" />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 flex items-center justify-center">
            </div>
            <h2 className="text-2xl font-semibold text-white">Create new agent</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Modality Selection - GigaAI Style */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">
              Select Agent Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModality("chat")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition ${
                  modality === "chat"
                    ? "bg-[rgba(139,90,60,0.3)] border border-white/10"
                    : "bg-black/40 border border-white/10 hover:bg-black/50"
                }`}
              >
                <MessageSquare className={`h-4 w-4 ${modality === "chat" ? "text-orange-400" : "text-white/60"}`} />
                <div className={`text-sm font-medium ${modality === "chat" ? "text-white" : "text-white/60"}`}>
                  Chat
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModality("voice")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition ${
                  modality === "voice"
                    ? "bg-[rgba(139,90,60,0.3)] border border-white/10"
                    : "bg-black/40 border border-white/10 hover:bg-black/50"
                }`}
              >
                <Phone className={`h-4 w-4 ${modality === "voice" ? "text-white" : "text-white/60"}`} />
                <div className={`text-sm font-medium ${modality === "voice" ? "text-white" : "text-white/60"}`}>
                  Voice
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModality("multi-modal")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition ${
                  modality === "multi-modal"
                    ? "bg-[rgba(139,90,60,0.3)] border border-white/10"
                    : "bg-black/40 border border-white/10 hover:bg-black/50"
                }`}
              >
                <Layers className={`h-4 w-4 ${modality === "multi-modal" ? "text-white" : "text-white/60"}`} />
                <div className={`text-sm font-medium ${modality === "multi-modal" ? "text-white" : "text-white/60"}`}>
                  Multi-modal
                </div>
              </button>
            </div>
          </div>

          {/* Training Documents - GigaAI Style */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Add training documents
            </label>
            <p className="text-xs text-white/50 mb-3">
              Attach files to give your agent business context
            </p>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-white/30 transition bg-black/20"
            >
              <input
                type="file"
                id="file-upload"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                {/* File Type Icons - GigaAI Style */}
                <div className="flex items-center justify-center gap-4 mb-4">
                  <Folder className="h-6 w-6 text-white/40" />
                  <div className="w-0.5 h-6 bg-white/20" />
                  <FileText className="h-6 w-6 text-white/40" />
                  <Image className="h-6 w-6 text-white/40" />
                  <Music className="h-6 w-6 text-white/40" />
                  <Play className="h-6 w-6 text-white/40" />
                </div>
                <p className="text-sm text-white/60 mb-1">
                  Drag files here or click to browse
                </p>
              </label>
            </div>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-white/70">
                    <FileText className="h-4 w-4" />
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
              className="px-6 py-2 rounded-2xl border border-white/10 bg-black/40 text-white hover:bg-black/60 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-2xl bg-[#3351ff] hover:bg-[#4a64ff] text-white font-medium transition"
            >
              Create agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
