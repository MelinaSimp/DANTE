"use client";

import { useState } from "react";
import { X, FileText, Upload } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface AddDocModalProps {
  onClose: () => void;
  onAdd: (name: string, type: "file" | "text", content?: string, fileUrl?: string, fileSize?: number, fileType?: string) => void;
  agentId: string;
}

export default function AddDocModal({ onClose, onAdd, agentId }: AddDocModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [type, setType] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setName(selectedFile.name);
      setType("file");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setUploading(true);
    try {
      if (type === "file" && file) {
        // Upload file
        const formData = new FormData();
        formData.append("file", file);
        formData.append("agentId", agentId);
        formData.append("category", "supporting-docs");

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          onAdd(name.trim(), "file", undefined, uploadData.url, uploadData.fileSize, uploadData.fileType);
          setName("");
          setFile(null);
          setTextContent("");
        } else {
          alert("Failed to upload file");
        }
      } else if (type === "text" && textContent.trim()) {
        onAdd(name.trim(), "text", textContent.trim());
        setName("");
        setTextContent("");
      } else {
        alert(type === "file" ? "Please select a file" : "Please enter text content");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border ${colors.border} bg-[#242423] p-6 shadow-2xl`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${colors.text}`}>Add Supporting Document</h3>
          <button
            onClick={onClose}
            className={`p-1 ${colors.hover} rounded transition`}
          >
            <X className={`h-5 w-5 ${colors.iconSecondary}`} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
              Document Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setType("file");
                  setFile(null);
                  setName("");
                }}
                className={`flex-1 px-4 py-2 rounded-2xl border transition ${
                  type === "file"
                    ? `${colors.selected}`
                    : `${colors.bgTertiary} ${colors.textTertiary} ${colors.hover}`
                } ${colors.border}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Upload className="h-4 w-4" />
                  File
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setType("text");
                  setFile(null);
                  setName("");
                }}
                className={`flex-1 px-4 py-2 rounded-2xl border transition ${
                  type === "text"
                    ? `${colors.selected}`
                    : `${colors.bgTertiary} ${colors.textTertiary} ${colors.hover}`
                } ${colors.border}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-4 w-4" />
                  Text
                </div>
              </button>
            </div>
          </div>

          {type === "file" ? (
            <div>
              <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                Upload File
              </label>
              <div className={`border-2 border-dashed ${colors.borderSecondary} rounded-2xl p-6 text-center hover:${colors.border} transition ${colors.bgTertiary}`}>
                <input
                  type="file"
                  id="file-upload"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <Upload className={`h-8 w-8 ${colors.iconSecondary} mb-2`} />
                  <p className={`text-sm ${colors.textTertiary} mb-1`}>
                    Click to upload or drag and drop
                  </p>
                  <p className={`text-xs ${colors.textTertiary}`}>
                    PDF, CSV, PNG, TXT, etc.
                  </p>
                </label>
                {file && (
                  <div className={`mt-3 text-sm ${colors.textSecondary}`}>
                    Selected: {file.name}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                  Document Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Compliance guidelines"
                  className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none px-4 py-2 text-sm`}
                  autoFocus
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                  Content
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={6}
                  placeholder="Enter document content here..."
                  className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none resize-none px-4 py-2 text-sm`}
                />
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-2xl border ${colors.border} ${colors.bgTertiary} ${colors.text} ${colors.hover} text-sm transition`}
            >
              Cancel
            </button>
            <div className="relative inline-block">
              <div className="absolute -inset-1 bg-gradient-to-br from-orange-500 via-orange-600 to-red-500 rounded-2xl blur-sm opacity-50"></div>
              <button
                type="submit"
                disabled={!name.trim() || uploading || (type === "file" && !file) || (type === "text" && !textContent.trim())}
                className={`relative px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {uploading ? "Uploading..." : "Add Document"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

