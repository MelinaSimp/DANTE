"use client";

import { useState, useEffect } from "react";
import { Upload, Database, X, GripVertical, Eye, Download, CheckCircle } from "lucide-react";
import ConfirmationModal from "./ConfirmationModal";
import { useTheme } from "./ThemeProvider";

interface DataSource {
  id: string;
  name: string;
  content?: string;
  file_url?: string;
  file_size?: number;
  file_type?: string;
  type: "file" | "text" | "api_key";
  integration_type?: string;
  integration_config?: any;
}

interface DataSourcesPageProps {
  agentId?: string;
}

export default function DataSourcesPage({ agentId }: DataSourcesPageProps) {
  const { colors } = useTheme();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [draggedOver, setDraggedOver] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [apiKeyType, setApiKeyType] = useState<"custom">("custom");
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
    dataSource: DataSource | null;
    content: string | null;
    loading: boolean;
  }>({
    isOpen: false,
    dataSource: null,
    content: null,
    loading: false,
  });

  // Load data sources from API
  useEffect(() => {
    async function loadDataSources() {
      if (!agentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/agents/${agentId}/data-sources`);
        if (response.ok) {
          const data = await response.json();
          setDataSources(data.map((d: any) => ({
            id: d.id,
            name: d.name,
            content: d.content,
            file_url: d.file_url,
            file_size: d.file_size,
            file_type: d.file_type,
            type: d.type,
          })));
        }
      } catch (error) {
        console.error("Failed to load data sources:", error);
      } finally {
        setLoading(false);
      }
    }
    loadDataSources();
    
    // Poll for updates every 5 seconds to check if PDF extraction completed
    const interval = setInterval(() => {
      if (agentId) {
        loadDataSources();
      }
    }, 5000);
    
    return () => clearInterval(interval);
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
        formData.append("category", "data-sources");

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(errorData.error || `Upload failed: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        
        // Create data source record
        const response = await fetch(`/api/agents/${agentId}/data-sources`, {
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
          const errorData = await response.json().catch(() => ({ error: "Failed to create data source" }));
          throw new Error(errorData.error || "Failed to create data source record");
        }

        const newDataSource = await response.json();
        setDataSources((prev) => [{
          id: newDataSource.id,
          name: newDataSource.name,
          content: newDataSource.content, // Include content to show checkmark if extracted
          file_url: newDataSource.file_url,
          file_size: newDataSource.file_size,
          file_type: newDataSource.file_type,
          type: newDataSource.type,
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
        formData.append("category", "data-sources");

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(errorData.error || `Upload failed: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        
        // Create data source record
        const response = await fetch(`/api/agents/${agentId}/data-sources`, {
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
          const errorData = await response.json().catch(() => ({ error: "Failed to create data source" }));
          throw new Error(errorData.error || "Failed to create data source record");
        }

        const newDataSource = await response.json();
        setDataSources((prev) => [{
          id: newDataSource.id,
          name: newDataSource.name,
          content: newDataSource.content, // Include content to show checkmark if extracted
          file_url: newDataSource.file_url,
          file_size: newDataSource.file_size,
          file_type: newDataSource.file_type,
          type: newDataSource.type,
        }, ...prev]);
      } catch (error: any) {
        console.error("Failed to upload file:", error);
        setUploadError(error.message || `Failed to upload ${file.name}`);
      }
    }
    e.target.value = ""; // Reset input
  };

  const addTextDataSource = async () => {
    if (!textInput.trim() || !agentId) return;
    
    try {
      const response = await fetch(`/api/agents/${agentId}/data-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Knowledge Base Entry ${new Date().toLocaleDateString()}`,
          type: "text",
          content: textInput.trim(),
        }),
      });

      if (response.ok) {
        const newDataSource = await response.json();
        setDataSources((prev) => [{
          id: newDataSource.id,
          name: newDataSource.name,
          content: newDataSource.content,
          type: newDataSource.type,
        }, ...prev]);
        setTextInput("");
        setShowTextInput(false);
      }
    } catch (error) {
      console.error("Failed to add data source:", error);
    }
  };

  const removeDataSource = (id: string) => {
    if (!agentId) return;
    
    setConfirmationModal({
      isOpen: true,
      title: "Delete Data Source",
      message: "Are you sure you want to delete this data source? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        setConfirmationModal({ ...confirmationModal, isOpen: false });
        try {
          const response = await fetch(`/api/agents/${agentId}/data-sources/${id}`, {
            method: "DELETE",
          });

          if (response.ok) {
            setDataSources((prev) => prev.filter((ds) => ds.id !== id));
          }
        } catch (error) {
          console.error("Failed to delete data source:", error);
        }
      },
    });
  };

  const previewDataSource = async (dataSource: DataSource) => {
    setPreviewModal({
      isOpen: true,
      dataSource,
      content: null,
      loading: true,
    });

    if (dataSource.type === "text") {
      setPreviewModal({
        isOpen: true,
        dataSource,
        content: dataSource.content || "",
        loading: false,
      });
    } else if (dataSource.file_url) {
      try {
        // Check file type from stored metadata first, then fetch if needed
        const fileType = dataSource.file_type || "";
        const isPDF = fileType === "application/pdf" || fileType.endsWith("pdf");
        const isImage = fileType.startsWith("image/");
        const isText = fileType.startsWith("text/");
        
        if (isPDF) {
          // For PDFs, show in iframe
          setPreviewModal({
            isOpen: true,
            dataSource,
            content: "PDF_PREVIEW", // Special marker for PDF
            loading: false,
          });
        } else if (isImage) {
          // For images, show the image
          setPreviewModal({
            isOpen: true,
            dataSource,
            content: dataSource.file_url,
            loading: false,
          });
        } else if (isText) {
          // For text files, fetch and display content
          const response = await fetch(dataSource.file_url);
          if (response.ok) {
            const text = await response.text();
            setPreviewModal({
              isOpen: true,
              dataSource,
              content: text,
              loading: false,
            });
          } else {
            setPreviewModal({
              isOpen: true,
              dataSource,
              content: "Unable to load file preview.",
              loading: false,
            });
          }
        } else {
          // Try to fetch and detect content type
          const response = await fetch(dataSource.file_url);
          if (response.ok) {
            const contentType = response.headers.get("content-type") || "";
            
            if (contentType.startsWith("text/")) {
              const text = await response.text();
              setPreviewModal({
                isOpen: true,
                dataSource,
                content: text,
                loading: false,
              });
            } else if (contentType.startsWith("image/")) {
              setPreviewModal({
                isOpen: true,
                dataSource,
                content: dataSource.file_url,
                loading: false,
              });
            } else if (contentType === "application/pdf" || contentType.includes("pdf")) {
              setPreviewModal({
                isOpen: true,
                dataSource,
                content: "PDF_PREVIEW",
                loading: false,
              });
            } else {
              // For other files, show file info
              setPreviewModal({
                isOpen: true,
                dataSource,
                content: `File type: ${dataSource.file_type || contentType}\nFile size: ${dataSource.file_size ? `${(dataSource.file_size / 1024).toFixed(2)} KB` : "Unknown"}\n\nPreview not available for this file type. Click download to view.`,
                loading: false,
              });
            }
          } else {
            setPreviewModal({
              isOpen: true,
              dataSource,
              content: "Unable to load file preview.",
              loading: false,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load file preview:", error);
        setPreviewModal({
          isOpen: true,
          dataSource,
          content: "Error loading file preview.",
          loading: false,
        });
      }
    }
  };

  return (
    <div className={`h-full flex flex-col overflow-y-auto ${colors.text}`} style={{ background: '#000000' }}>
      <div className="max-w-4xl mx-auto w-full p-6">
        <div className="mb-6">
          <h2 className={`text-base font-semibold ${colors.text} mb-2`}>Data Sources</h2>
          <p className={`${colors.textSecondary} text-xs`}>
            Add files and text that represent your knowledge base. This is the information your AI agent will use to answer questions.
          </p>
        </div>

      {/* Add Data Source Buttons */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <button
          onClick={() => {
            setShowTextInput(!showTextInput);
            setShowApiKeyInput(false);
          }}
          className={`px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition`}
        >
          + Add Text Knowledge
        </button>
        <button
          onClick={() => {
            setShowApiKeyInput(!showApiKeyInput);
            setShowTextInput(false);
          }}
          className={`px-4 py-2 rounded-2xl border ${colors.border} ${colors.cardBg} ${colors.text} text-sm font-medium transition`}
        >
          + Add API Key
        </button>
      </div>

      {/* Text Input */}
      {showTextInput && (
        <div className={`mb-4 p-4 rounded-2xl border ${colors.border} ${colors.cardBg}`}>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter knowledge base content here..."
            rows={4}
            className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none mb-3`}
          />
          <div className="flex gap-2">
            <button
              onClick={addTextDataSource}
              className={`px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium`}
            >
              Add Data Source
            </button>
            <button
              onClick={() => {
                setShowTextInput(false);
                setTextInput("");
              }}
              className={`px-4 py-2 rounded-2xl border ${colors.border} ${colors.cardBg} ${colors.text} text-sm`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* API Key Input */}
      {showApiKeyInput && (
        <div className={`mb-4 p-4 rounded-2xl border ${colors.border} ${colors.cardBg}`}>
          <div className="space-y-3">
            <div>
              <label className={`block text-xs font-medium ${colors.textSecondary} mb-1`}>API Key Type</label>
              <select
                value={apiKeyType}
                onChange={(e) => setApiKeyType(e.target.value as "custom")}
                className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-sm ${colors.text} focus:border-[#3351ff] focus:outline-none`}
              >
                <option value="custom">Custom API Key</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium ${colors.textSecondary} mb-1`}>Name</label>
              <input
                type="text"
                value={apiKeyName}
                onChange={(e) => setApiKeyName(e.target.value)}
                placeholder="API Key Name"
                className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
              />
            </div>
            <div>
              <label className={`block text-xs font-medium ${colors.textSecondary} mb-1`}>API Key</label>
              <input
                type="password"
                value={apiKeyValue}
                onChange={(e) => setApiKeyValue(e.target.value)}
                placeholder="Enter API key..."
                className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!apiKeyName.trim() || !apiKeyValue.trim() || !agentId) return;
                  
                  try {
                    const response = await fetch(`/api/agents/${agentId}/data-sources`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: apiKeyName.trim(),
                        type: "api_key",
                        content: apiKeyValue.trim(), // Store API key in content field
                        integration_type: null,
                        integration_config: {},
                      }),
                    });

                    if (response.ok) {
                      const newDataSource = await response.json();
                      setDataSources((prev) => [{
                        id: newDataSource.id,
                        name: newDataSource.name,
                        type: "api_key",
                        integration_type: newDataSource.integration_type,
                        integration_config: newDataSource.integration_config,
                      }, ...prev]);
                      setApiKeyName("");
                      setApiKeyValue("");
                      setShowApiKeyInput(false);
                    }
                  } catch (error) {
                    console.error("Failed to add API key:", error);
                  }
                }}
                className={`px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium`}
              >
                Add API Key
              </button>
              <button
                onClick={() => {
                  setShowApiKeyInput(false);
                  setApiKeyName("");
                  setApiKeyValue("");
                }}
                className={`px-4 py-2 rounded-2xl border ${colors.border} ${colors.cardBg} ${colors.text} text-sm`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Error Message */}
      {uploadError && (
        <div className="mb-4 p-3 rounded-2xl bg-red-500/20 border border-red-500/30">
          <p className="text-sm text-red-300">{uploadError}</p>
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
          className={`rounded-3xl border border-white/10 bg-[#242423]/90 backdrop-blur-sm p-6 transition ${
            draggedOver
              ? `border-[#3351ff] bg-[#3351ff]/10`
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
        {dataSources.length === 0 ? (
          <label htmlFor="file-upload" className="cursor-pointer block">
            <div className="text-center py-12">
              <Database className={`h-12 w-12 ${colors.iconSecondary} mx-auto mb-4`} />
              <p className={`${colors.textSecondary} mb-2`}>Drag and drop knowledge base files here</p>
              <p className={`${colors.textTertiary} text-sm`}>or click to browse</p>
            </div>
          </label>
        ) : (
          <div>
            <div className="space-y-3 mb-4">
              {dataSources.map((dataSource) => (
                <div
                  key={dataSource.id}
                  className={`flex items-center gap-3 p-4 rounded-2xl border ${colors.border} ${colors.cardBg} ${colors.hover} transition`}
                >
                  <GripVertical className={`h-5 w-5 ${colors.iconSecondary}`} />
                  <Database className={`h-5 w-5 ${colors.iconSecondary}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`text-sm font-medium ${colors.text}`}>{dataSource.name}</div>
                      {/* Show checkmark if PDF has extracted content */}
                      {dataSource.type === "file" && 
                       (dataSource.file_type === "application/pdf" || dataSource.name.toLowerCase().endsWith('.pdf')) &&
                       dataSource.content && 
                       dataSource.content.trim().length > 0 && (
                        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" aria-label="Text extracted successfully" />
                      )}
                    </div>
                    <div className={`text-xs ${colors.textTertiary} mt-1 line-clamp-2`}>
                      {dataSource.type === "text" 
                        ? dataSource.content 
                        : dataSource.file_url 
                          ? `File: ${dataSource.name}${dataSource.content && dataSource.content.trim().length > 0 ? " • Text extracted" : ""}`
                          : dataSource.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => previewDataSource(dataSource)}
                      className={`p-2 ${colors.hover} rounded-2xl transition`}
                      title="Preview"
                    >
                      <Eye className={`h-4 w-4 ${colors.iconSecondary}`} />
                    </button>
                    {dataSource.file_url && (
                      <a
                        href={dataSource.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-2 ${colors.hover} rounded-2xl transition`}
                        title="Download"
                      >
                        <Download className={`h-4 w-4 ${colors.iconSecondary}`} />
                      </a>
                    )}
                    <button
                      onClick={() => removeDataSource(dataSource.id)}
                      className={`p-2 ${colors.hover} rounded-2xl transition`}
                      title="Delete"
                    >
                      <X className={`h-4 w-4 ${colors.iconSecondary}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <label htmlFor="file-upload" className="cursor-pointer block">
              <div className="text-center py-6 border-2 border-dashed border-white/20 rounded-3xl hover:border-[#3351ff] transition">
                <Database className={`h-8 w-8 ${colors.iconSecondary} mx-auto mb-2`} />
                <p className={`${colors.textSecondary} text-sm mb-1`}>Drag and drop more files here</p>
                <p className={`${colors.textTertiary} text-xs`}>or click to browse</p>
              </div>
            </label>
          </div>
        )}
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
      {previewModal.isOpen && previewModal.dataSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={`relative w-full max-w-4xl max-h-[90vh] rounded-xl border ${colors.border} ${colors.cardBg} flex flex-col overflow-hidden`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${colors.border}`}>
              <div>
                <h3 className={`text-lg font-semibold ${colors.text}`}>{previewModal.dataSource.name}</h3>
                <p className={`text-xs ${colors.textTertiary} mt-1`}>
                  {previewModal.dataSource.type === "text" ? "Text Knowledge Base" : `File: ${previewModal.dataSource.file_type || "Unknown type"}`}
                </p>
              </div>
              <button
                onClick={() => setPreviewModal({ isOpen: false, dataSource: null, content: null, loading: false })}
                className={`p-2 ${colors.hover} rounded-2xl transition`}
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
                  {previewModal.content === "PDF_PREVIEW" && previewModal.dataSource.file_url ? (
                    <div className="w-full h-[60vh]">
                      <iframe
                        src={previewModal.dataSource.file_url}
                        className="w-full h-full rounded-2xl border border-white/10"
                        title={previewModal.dataSource.name}
                      />
                    </div>
                  ) : previewModal.dataSource.type === "file" && 
                    previewModal.dataSource.file_type?.startsWith("image/") ? (
                    <div className="flex items-center justify-center">
                      <img 
                        src={previewModal.content} 
                        alt={previewModal.dataSource.name}
                        className="max-w-full max-h-[60vh] rounded-2xl"
                      />
                    </div>
                  ) : (
                    <pre className={`whitespace-pre-wrap text-sm ${colors.text} font-mono bg-[#1a1a1a] p-4 rounded-2xl overflow-x-auto`}>
                      {previewModal.content}
                    </pre>
                  )}
                </>
              ) : (
                <div className={`text-center ${colors.textTertiary}`}>No preview available</div>
              )}
            </div>

            {/* Footer */}
            {previewModal.dataSource.file_url && (
              <div className={`flex items-center justify-end gap-2 p-4 border-t ${colors.border}`}>
                <a
                  href={previewModal.dataSource.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition flex items-center gap-2`}
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

