// app/frontend/agent/[agentId]/policies/page.tsx - Policies Page with Apple-style Light Theme
"use client";

import { useState, useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { Upload, FileText, X, GripVertical, Eye, Download } from "lucide-react";
import Link from "next/link";
import { Bot, Calendar as CalIcon, Database as DbIcon, Shield, Sparkles, BarChart3 } from "lucide-react";
import ConfirmationModal from "@/app/gigaai/ConfirmationModal";

interface Policy {
  id: string;
  name: string;
  content?: string;
  file_url?: string;
  file_size?: number;
  file_type?: string;
  type: "file" | "text";
}

export default function PoliciesPage() {
  const params = useParams();
  const pathname = usePathname();
  const agentId = params.agentId as string;
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

  useEffect(() => {
    // Override global dark theme styles for Apple-style light theme
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector('main');
    
    const originalHtmlBg = html.style.background;
    const originalBodyBg = body.style.background;
    const originalBodyColor = body.style.color;
    const originalMainBg = main ? (main as HTMLElement).style.background : null;
    
    html.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('color', '#111827', 'important');
    if (main) {
      (main as HTMLElement).style.setProperty('background', '#f5f5f7', 'important');
    }

    return () => {
      html.style.setProperty('background', originalHtmlBg, 'important');
      body.style.setProperty('background', originalBodyBg, 'important');
      body.style.setProperty('color', originalBodyColor, 'important');
      if (main && originalMainBg !== null) {
        (main as HTMLElement).style.setProperty('background', originalMainBg, 'important');
      }
    };
  }, []);

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
          throw new Error("Failed to create policy record");
        }

        const newPolicy = await response.json();
        setPolicies((prev) => [{
          id: newPolicy.id,
          name: newPolicy.name,
          content: newPolicy.content,
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
          throw new Error("Failed to create policy record");
        }

        const newPolicy = await response.json();
        setPolicies((prev) => [{
          id: newPolicy.id,
          name: newPolicy.name,
          content: newPolicy.content,
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
    e.target.value = "";
  };

  const addTextPolicy = async () => {
    if (!textInput.trim() || !agentId) return;
    
    try {
      const response = await fetch(`/api/agents/${agentId}/policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Policy Entry ${new Date().toLocaleDateString()}`,
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
        const fileType = policy.file_type || "";
        const isPDF = fileType === "application/pdf" || fileType.endsWith("pdf");
        const isImage = fileType.startsWith("image/");
        const isText = fileType.startsWith("text/");
        
        if (isPDF) {
          setPreviewModal({
            isOpen: true,
            policy,
            content: "PDF_PREVIEW",
            loading: false,
          });
        } else if (isImage) {
          setPreviewModal({
            isOpen: true,
            policy,
            content: policy.file_url,
            loading: false,
          });
        } else if (isText) {
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

  // Sidebar navigation items
  const sidebarItems = [
    { 
      name: "Agents", 
      icon: Bot, 
      href: "/frontend",
      active: pathname === "/frontend" || pathname?.startsWith("/frontend/agent"),
      requiresAgent: false
    },
    { 
      name: "Calendar", 
      icon: CalIcon, 
      href: `/frontend/agent/${agentId}/schedule`,
      active: pathname?.includes("/schedule"),
      requiresAgent: true
    },
    { 
      name: "Data Sources", 
      icon: DbIcon, 
      href: `/frontend/agent/${agentId}/data-sources`,
      active: pathname?.includes("/data-sources"),
      requiresAgent: true
    },
    { 
      name: "Policies", 
      icon: Shield, 
      href: `/frontend/agent/${agentId}/policies`,
      active: pathname?.includes("/policies"),
      requiresAgent: true
    },
    { 
      name: "LLM", 
      icon: Sparkles, 
      href: `/frontend/agent/${agentId}/llm`,
      active: pathname?.includes("/llm"),
      requiresAgent: true
    },
    { 
      name: "Insights", 
      icon: BarChart3, 
      href: `/frontend/agent/${agentId}/insights`,
      active: pathname?.includes("/insights"),
      requiresAgent: true
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex" style={{ background: '#f5f5f7' }}>
      {/* Left Sidebar - Apple Glass Style */}
      <div className="fixed left-0 top-0 h-full w-72 z-50">
        <div 
          className="h-full border-r border-gray-300/10 bg-gray-200/90 backdrop-blur-sm shadow-2xl"
        >
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-200/20">
            <Link href="/" className="inline-flex items-center gap-2">
              <img 
                src="/brand/logo-circle.png" 
                alt="Drift Logo"
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="text-lg font-medium text-gray-900">Drift</span>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.active;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600/10 text-blue-600"
                      : "text-gray-700 hover:bg-white/30"
                  }`}
                >
                  {/* Icon with purplish gradient halo */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-full blur-sm opacity-50"></div>
                    <div className="relative bg-white rounded-full p-2">
                      <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : "text-gray-600"}`} />
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${isActive ? "text-blue-600" : "text-gray-700"}`}>
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 ml-72 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-6 bg-[#f5f5f7]">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Policies</h2>
              <p className="text-gray-600 text-sm">
                Add policies that your AI agent should adhere to. These represent guidelines any employee should follow.
              </p>
            </div>

            {/* Error Message */}
            {uploadError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{uploadError}</p>
                <button
                  onClick={() => setUploadError(null)}
                  className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Drop Zone */}
            <div
              className={`rounded-2xl border border-gray-200 bg-white p-6 transition ${
                draggedOver
                  ? "border-blue-500 bg-blue-50"
                  : ""
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
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading...</div>
              ) : policies.length === 0 ? (
                <label htmlFor="file-upload" className="cursor-pointer block">
                  <div className="text-center py-12">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-700 mb-2">Drag and drop policy files here</p>
                    <p className="text-gray-500 text-sm">or click to browse</p>
                  </div>
                </label>
              ) : (
                <div>
                  <div className="space-y-3 mb-4">
                    {policies.map((policy) => (
                      <div
                        key={policy.id}
                        className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition"
                      >
                        <GripVertical className="h-5 w-5 text-gray-400" />
                        <FileText className="h-5 w-5 text-gray-600" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{policy.name}</div>
                          <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {policy.type === "text" ? policy.content : policy.file_url ? `File: ${policy.name}` : policy.name}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => previewPolicy(policy)}
                            className="p-2 hover:bg-gray-100 rounded-xl transition"
                            title="Preview"
                          >
                            <Eye className="h-4 w-4 text-gray-600" />
                          </button>
                          {policy.file_url && (
                            <a
                              href={policy.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 hover:bg-gray-100 rounded-xl transition"
                              title="Download"
                            >
                              <Download className="h-4 w-4 text-gray-600" />
                            </a>
                          )}
                          <button
                            onClick={() => removePolicy(policy.id)}
                            className="p-2 hover:bg-gray-100 rounded-xl transition"
                            title="Delete"
                          >
                            <X className="h-4 w-4 text-gray-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <label htmlFor="file-upload" className="cursor-pointer block">
                    <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 transition">
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-700 text-sm mb-1">Drag and drop more files here</p>
                      <p className="text-gray-500 text-xs">or click to browse</p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Add Text Policy Button */}
            <div className="mt-4">
              <button
                onClick={() => setShowTextInput(!showTextInput)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
              >
                + Add Text Policy
              </button>
            </div>

            {/* Text Input */}
            {showTextInput && (
              <div className="mt-4 p-4 rounded-2xl border border-gray-200 bg-white">
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Enter policy text here..."
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addTextPolicy}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
                  >
                    Add Policy
                  </button>
                  <button
                    onClick={() => {
                      setShowTextInput(false);
                      setTextInput("");
                    }}
                    className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
          <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl border border-gray-200 bg-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{previewModal.policy.name}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {previewModal.policy.type === "text" ? "Text Policy" : `File: ${previewModal.policy.file_type || "Unknown type"}`}
                </p>
              </div>
              <button
                onClick={() => setPreviewModal({ isOpen: false, policy: null, content: null, loading: false })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {previewModal.loading ? (
                <div className="text-center text-gray-500">Loading preview...</div>
              ) : previewModal.content ? (
                <>
                  {previewModal.content === "PDF_PREVIEW" && previewModal.policy.file_url ? (
                    <div className="w-full h-[60vh]">
                      <iframe
                        src={previewModal.policy.file_url}
                        className="w-full h-full rounded-xl border border-gray-200"
                        title={previewModal.policy.name}
                      />
                    </div>
                  ) : previewModal.policy.type === "file" && 
                    previewModal.policy.file_type?.startsWith("image/") ? (
                    <div className="flex items-center justify-center">
                      <img 
                        src={previewModal.content} 
                        alt={previewModal.policy.name}
                        className="max-w-full max-h-[60vh] rounded-xl"
                      />
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-gray-900 font-mono bg-gray-50 p-4 rounded-xl overflow-x-auto">
                      {previewModal.content}
                    </pre>
                  )}
                </>
              ) : (
                <div className="text-center text-gray-500">No preview available</div>
              )}
            </div>

            {/* Footer */}
            {previewModal.policy.file_url && (
              <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
                <a
                  href={previewModal.policy.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition flex items-center gap-2"
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
  );
}
