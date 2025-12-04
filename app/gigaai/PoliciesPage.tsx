"use client";

import { useState, useEffect } from "react";
import { Upload, FileText, X, GripVertical, Eye, Download } from "lucide-react";
import ConfirmationModal from "./ConfirmationModal";
import { useTheme } from "./ThemeProvider";

interface Policy {
  id: string;
  name: string;
  content?: string;
  file_url?: string;
  file_size?: number;
  file_type?: string;
  type: "file" | "text";
}

interface PoliciesPageProps {
  agentId?: string;
}

export default function PoliciesPage({ agentId }: PoliciesPageProps) {
  const { colors } = useTheme();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [draggedOver, setDraggedOver] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    policy: Policy | null;
    content: string | null;
    loading: boolean;
  }>({
    isOpen: false,
    policy: null,
    content: null,
    loading: false,
  });

  // Load policies from API
  useEffect(() => {
    async function loadPolicies() {
      if (!agentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/agents/${agentId}/policies`);
        if (response.ok) {
          const data = await response.json();
          setPolicies(data.map((p: any) => ({
            id: p.id,
            name: p.name,
            content: p.content,
            file_url: p.file_url,
            file_size: p.file_size,
            file_type: p.file_type,
            type: p.type,
          })));
        }
      } catch (error) {
        console.error("Failed to load policies:", error);
      } finally {
        setLoading(false);
      }
    }
    loadPolicies();
  }, [agentId]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOver(false);
    if (!agentId) {
      setUploadError("No agent selected");
      return;
    }
    
    setUploadError(null);
    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      try {
        // Upload file
        const formData = new FormData();
        formData.append("file", file);
        formData.append("agentId", agentId);
        formData.append("category", "policies");

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(errorData.error || `Upload failed: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        
        // Create policy record
        const response = await fetch(`/api/agents/${agentId}/policies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            type: "file",
            file_url: uploadData.url,
            file_size: uploadData.fileSize,
            file_type: uploadData.fileType,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to create policy" }));
          throw new Error(errorData.error || "Failed to create policy record");
        }

        const newPolicy = await response.json();
        setPolicies((prev) => [{
          id: newPolicy.id,
          name: newPolicy.name,
          file_url: newPolicy.file_url,
          file_size: newPolicy.file_size,
          file_type: newPolicy.file_type,
          type: newPolicy.type,
        }, ...prev]);
      } catch (error: any) {
        console.error("Failed to upload file:", error);
        setUploadError(error.message || `Failed to upload ${file.name}`);
      }
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !agentId) {
      setUploadError("No agent selected");
      return;
    }
    
    setUploadError(null);
    const files = Array.from(e.target.files);
    
    for (const file of files) {
      try {
        // Upload file
        const formData = new FormData();
        formData.append("file", file);
        formData.append("agentId", agentId);
        formData.append("category", "policies");

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(errorData.error || `Upload failed: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        
        // Create policy record
        const response = await fetch(`/api/agents/${agentId}/policies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            type: "file",
            file_url: uploadData.url,
            file_size: uploadData.fileSize,
            file_type: uploadData.fileType,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to create policy" }));
          throw new Error(errorData.error || "Failed to create policy record");
        }

        const newPolicy = await response.json();
        setPolicies((prev) => [{
          id: newPolicy.id,
          name: newPolicy.name,
          file_url: newPolicy.file_url,
          file_size: newPolicy.file_size,
          file_type: newPolicy.file_type,
          type: newPolicy.type,
        }, ...prev]);
      } catch (error: any) {
        console.error("Failed to upload file:", error);
        setUploadError(error.message || `Failed to upload ${file.name}`);
      }
    }
    e.target.value = ""; // Reset input
  };

  const addTextPolicy = async () => {
    if (!textInput.trim() || !agentId) return;
    
    try {
      const response = await fetch(`/api/agents/${agentId}/policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Text Policy ${new Date().toLocaleDateString()}`,
          type: "text",
          content: textInput.trim(),
        }),
      });

      if (response.ok) {
        const newPolicy = await response.json();
        setPolicies((prev) => [{
          id: newPolicy.id,
          name: newPolicy.name,
          content: newPolicy.content,
          type: newPolicy.type,
        }, ...prev]);
        setTextInput("");
        setShowTextInput(false);
      }
    } catch (error) {
      console.error("Failed to add policy:", error);
    }
  };

  const removePolicy = (id: string) => {
    if (!agentId) return;
    
    setConfirmationModal({
      isOpen: true,
      title: "Delete Policy",
      message: "Are you sure you want to delete this policy? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        setConfirmationModal({ ...confirmationModal, isOpen: false });
        try {
          const response = await fetch(`/api/agents/${agentId}/policies/${id}`, {
            method: "DELETE",
          });

          if (response.ok) {
            setPolicies((prev) => prev.filter((p) => p.id !== id));
          }
        } catch (error) {
          console.error("Failed to delete policy:", error);
        }
      },
    });
  };

  const previewPolicy = async (policy: Policy) => {
    setPreviewModal({
      isOpen: true,
      policy,
      content: null,
      loading: true,
    });

    if (policy.type === "text") {
      setPreviewModal({
        isOpen: true,
        policy,
        content: policy.content || "",
        loading: false,
      });
    } else if (policy.file_url) {
      try {
        // Check file type from stored metadata first, then fetch if needed
        const fileType = policy.file_type || "";
        const isPDF = fileType === "application/pdf" || fileType.endsWith("pdf");
        const isImage = fileType.startsWith("image/");
        const isText = fileType.startsWith("text/");
        
        if (isPDF) {
          // For PDFs, show in iframe
          setPreviewModal({
            isOpen: true,
            policy,
            content: "PDF_PREVIEW", // Special marker for PDF
            loading: false,
          });
        } else if (isImage) {
          // For images, show the image
          setPreviewModal({
            isOpen: true,
            policy,
            content: policy.file_url,
            loading: false,
          });
        } else if (isText) {
          // For text files, fetch and display content
          const response = await fetch(policy.file_url);
          if (response.ok) {
            const text = await response.text();
            setPreviewModal({
              isOpen: true,
              policy,
              content: text,
              loading: false,
            });
          } else {
            setPreviewModal({
              isOpen: true,
              policy,
              content: "Unable to load file preview.",
              loading: false,
            });
          }
        } else {
          // Try to fetch and detect content type
          const response = await fetch(policy.file_url);
          if (response.ok) {
            const contentType = response.headers.get("content-type") || "";
            
            if (contentType.startsWith("text/")) {
              const text = await response.text();
              setPreviewModal({
                isOpen: true,
                policy,
                content: text,
                loading: false,
              });
            } else if (contentType.startsWith("image/")) {
              setPreviewModal({
                isOpen: true,
                policy,
                content: policy.file_url,
                loading: false,
              });
            } else if (contentType === "application/pdf" || contentType.includes("pdf")) {
              setPreviewModal({
                isOpen: true,
                policy,
                content: "PDF_PREVIEW",
                loading: false,
              });
            } else {
              // For other files, show file info
              setPreviewModal({
                isOpen: true,
                policy,
                content: `File type: ${policy.file_type || contentType}\nFile size: ${policy.file_size ? `${(policy.file_size / 1024).toFixed(2)} KB` : "Unknown"}\n\nPreview not available for this file type. Click download to view.`,
                loading: false,
              });
            }
          } else {
            setPreviewModal({
              isOpen: true,
              policy,
              content: "Unable to load file preview.",
              loading: false,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load file preview:", error);
        setPreviewModal({
          isOpen: true,
          policy,
          content: "Error loading file preview.",
          loading: false,
        });
      }
    }
  };

  return (
    <div className={`h-full flex flex-col overflow-y-auto ${colors.text}`} style={{ background: '#ffffff', backgroundImage: 'none' }}>
      <div className="max-w-4xl mx-auto w-full p-6">
        <div className="mb-6">
          <h2 className={`text-base font-semibold ${colors.text} mb-2`}>Policies</h2>
          <p className={`${colors.textSecondary} text-xs`}>
            Add policies that your AI agent should adhere to. These represent guidelines any employee should follow.
          </p>
        </div>

      {/* Error Message */}
      {uploadError && (
        <div className="mb-4 p-3 rounded-lg bg-[#fef2f2] border border-[#f0494a]/30">
          <p className="text-sm text-[#f0494a]">{uploadError}</p>
          <button
            onClick={() => setUploadError(null)}
            className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Drop Zone - Centered box */}
        <div
          className={`rounded-lg border border-[#e5e7eb] bg-[#ffffff] p-6 transition ${
            draggedOver
              ? `border-[#3166bf] bg-[#3166bf]/10`
              : ``
          }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDraggedOver(true);
        }}
        onDragLeave={() => setDraggedOver(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept=".pdf,application/pdf,.txt,.md,.doc,.docx,text/*"
          onChange={handleFileInput}
          className="hidden"
        />
        {policies.length === 0 ? (
          <label htmlFor="file-upload" className="cursor-pointer block">
            <div className="text-center py-12">
              <Upload className={`h-12 w-12 ${colors.iconSecondary} mx-auto mb-4`} />
              <p className={`${colors.textSecondary} mb-2`}>Drag and drop policy files here</p>
              <p className={`${colors.textTertiary} text-sm`}>or click to browse</p>
            </div>
          </label>
        ) : (
          <div>
            <div className="space-y-3 mb-4">
              {policies.map((policy) => (
                <div
                  key={policy.id}
                  className={`flex items-center gap-3 p-4 rounded-lg border ${colors.border} ${colors.cardBg} ${colors.hover} transition`}
                >
                  <GripVertical className={`h-5 w-5 ${colors.iconSecondary}`} />
                  <FileText className={`h-5 w-5 ${colors.iconSecondary}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${colors.text}`}>{policy.name}</div>
                    <div className={`text-xs ${colors.textTertiary} mt-1 line-clamp-2`}>
                      {policy.type === "text" ? policy.content : policy.file_url ? `File: ${policy.name}` : policy.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => previewPolicy(policy)}
                      className={`p-2 ${colors.hover} rounded-lg transition`}
                      title="Preview"
                    >
                      <Eye className={`h-4 w-4 ${colors.iconSecondary}`} />
                    </button>
                    {policy.file_url && (
                      <a
                        href={policy.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-2 ${colors.hover} rounded-lg transition`}
                        title="Download"
                      >
                        <Download className={`h-4 w-4 ${colors.iconSecondary}`} />
                      </a>
                    )}
                    <button
                      onClick={() => removePolicy(policy.id)}
                      className={`p-2 ${colors.hover} rounded-lg transition`}
                      title="Delete"
                    >
                      <X className={`h-4 w-4 ${colors.iconSecondary}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <label htmlFor="file-upload" className="cursor-pointer block">
              <div className="text-center py-6 border-2 border-dashed border-[#e5e7eb] rounded-lg hover:border-[#3166bf] transition">
                <Upload className={`h-8 w-8 ${colors.iconSecondary} mx-auto mb-2`} />
                <p className={`${colors.textSecondary} text-sm mb-1`}>Drag and drop more files here</p>
                <p className={`${colors.textTertiary} text-xs`}>or click to browse</p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Add Text Policy Button */}
      <div className="mt-4">
        <button
          onClick={() => setShowTextInput(!showTextInput)}
          className={`px-4 py-2 rounded-lg ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition`}
        >
          + Add Text Policy
        </button>
      </div>

      {/* Text Input */}
      {showTextInput && (
        <div className={`mt-4 p-4 rounded-lg border ${colors.border} ${colors.cardBg}`}>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter policy text here..."
            rows={4}
            className={`w-full rounded-lg border border-[#3166bf] bg-[#ffffff] px-3 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3166bf] focus:outline-none mb-3`}
          />
          <div className="flex gap-2">
            <button
              onClick={addTextPolicy}
              className="px-4 py-2 rounded-lg bg-[#3166bf] hover:bg-[#2a5aa8] text-white text-sm font-medium"
            >
              Add Policy
            </button>
            <button
              onClick={() => {
                setShowTextInput(false);
                setTextInput("");
              }}
              className={`px-4 py-2 rounded-lg border ${colors.border} ${colors.cardBg} ${colors.text} text-sm`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={confirmationModal.confirmText}
        cancelText={confirmationModal.cancelText}
        variant={confirmationModal.variant}
        onConfirm={confirmationModal.onConfirm}
        onCancel={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
      />

      {/* Preview Modal */}
      {previewModal.isOpen && previewModal.policy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={`relative w-full max-w-4xl max-h-[90vh] rounded-xl border ${colors.border} ${colors.cardBg} flex flex-col overflow-hidden`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${colors.border}`}>
              <div>
                <h3 className={`text-lg font-semibold ${colors.text}`}>{previewModal.policy.name}</h3>
                <p className={`text-xs ${colors.textTertiary} mt-1`}>
                  {previewModal.policy.type === "text" ? "Text Policy" : `File: ${previewModal.policy.file_type || "Unknown type"}`}
                </p>
              </div>
              <button
                onClick={() => setPreviewModal({ isOpen: false, policy: null, content: null, loading: false })}
                className={`p-2 ${colors.hover} rounded-lg transition`}
              >
                <X className={`h-5 w-5 ${colors.iconSecondary}`} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {previewModal.loading ? (
                <div className={`text-center ${colors.textTertiary}`}>Loading preview...</div>
              ) : previewModal.content ? (
                <>
                  {previewModal.content === "PDF_PREVIEW" && previewModal.policy.file_url ? (
                    <div className="w-full h-[60vh]">
                      <iframe
                        src={previewModal.policy.file_url}
                        className="w-full h-full rounded-lg border border-white/10"
                        title={previewModal.policy.name}
                      />
                    </div>
                  ) : previewModal.policy.type === "file" && 
                    previewModal.policy.file_type?.startsWith("image/") ? (
                    <div className="flex items-center justify-center">
                      <img 
                        src={previewModal.content} 
                        alt={previewModal.policy.name}
                        className="max-w-full max-h-[60vh] rounded-lg"
                      />
                    </div>
                  ) : (
                    <pre className={`whitespace-pre-wrap text-sm ${colors.text} font-mono bg-[#1a1a1a] p-4 rounded-lg overflow-x-auto`}>
                      {previewModal.content}
                    </pre>
                  )}
                </>
              ) : (
                <div className={`text-center ${colors.textTertiary}`}>No preview available</div>
              )}
            </div>

            {/* Footer */}
            {previewModal.policy.file_url && (
              <div className={`flex items-center justify-end gap-2 p-4 border-t ${colors.border}`}>
                <a
                  href={previewModal.policy.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-4 py-2 rounded-lg ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition flex items-center gap-2`}
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

