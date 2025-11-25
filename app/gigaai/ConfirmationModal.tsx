"use client";

import { X, AlertTriangle } from "lucide-react";
import { useTheme } from "./ThemeProvider";

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
  const { colors } = useTheme();
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      confirmBg: "bg-red-500 hover:bg-red-600",
      iconColor: "text-red-400",
      borderColor: "border-red-500/30",
    },
    warning: {
      confirmBg: "bg-orange-500 hover:bg-orange-600",
      iconColor: "text-orange-400",
      borderColor: "border-orange-500/30",
    },
    info: {
      confirmBg: "bg-blue-500 hover:bg-blue-600",
      iconColor: "text-blue-400",
      borderColor: "border-blue-500/30",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`w-full max-w-md mx-4 rounded-2xl border ${colors.border} ${colors.cardBg} backdrop-blur shadow-2xl overflow-hidden`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${styles.borderColor} ${colors.bgSecondary}`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-5 w-5 ${styles.iconColor}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>{title}</h3>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className={`${colors.textSecondary} leading-relaxed`}>{message}</p>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t ${colors.border} ${colors.bgSecondary} flex items-center justify-end gap-3`}>
          <button
            onClick={onCancel}
            className={`px-4 py-2 rounded-lg border ${colors.border} ${colors.bgSecondary} ${colors.text} text-sm font-medium ${colors.hover} transition`}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition ${styles.confirmBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

