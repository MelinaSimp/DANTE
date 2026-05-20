// components/frontend/ConfirmationModal.tsx - Light theme confirmation modal for frontend
"use client";

import { X, AlertTriangle } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
}

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  variant = "danger",
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      confirmBg: "bg-red-500 hover:bg-red-600",
      iconColor: "text-red-600",
      borderColor: "border-red-200",
      bgColor: "bg-red-50",
    },
    warning: {
      confirmBg: "bg-[#3351ff] hover:bg-[#4a64ff]",
      iconColor: "text-[#3351ff]",
      borderColor: "border-blue-200",
      bgColor: "bg-blue-50",
    },
    info: {
      confirmBg: "bg-blue-500 hover:bg-blue-600",
      iconColor: "text-blue-600",
      borderColor: "border-blue-200",
      bgColor: "bg-blue-50",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${styles.borderColor} ${styles.bgColor}`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-5 w-5 ${styles.iconColor}`} />
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-gray-700 leading-relaxed">{message}</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-medium hover:bg-gray-50 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition ${styles.confirmBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
