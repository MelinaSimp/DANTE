"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";

type Variant = "danger" | "warning" | "info";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: Variant;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

interface ConfirmContextType {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

// Imperative API — set by provider on mount so non-hook code can call it.
let imperativeConfirm: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const options = typeof opts === "string" ? { message: opts } : opts;
  if (!imperativeConfirm) {
    // Fallback to native confirm if provider not mounted yet.
    if (typeof window !== "undefined") {
      return Promise.resolve(window.confirm(options.message));
    }
    return Promise.resolve(false);
  }
  return imperativeConfirm(options);
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmDialogProvider");
  return ctx.confirm;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  useEffect(() => {
    imperativeConfirm = confirm;
    return () => {
      imperativeConfirm = null;
    };
  }, [confirm]);

  const handleClose = (result: boolean) => {
    if (state) {
      state.resolve(result);
      setState(null);
    }
  };

  const variant: Variant = state?.variant ?? "danger";
  const variantStyles = {
    danger: { btn: "bg-red-500 hover:bg-red-600", icon: "text-red-400" },
    warning: { btn: "bg-[#3351ff] hover:bg-[#4a64ff]", icon: "text-[#6f89ff]" },
    info: { btn: "bg-blue-500 hover:bg-blue-600", icon: "text-blue-400" },
  }[variant];

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xl backdrop-saturate-150 animate-fade-in"
          onClick={() => handleClose(false)}
        >
          <div
            className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-[#1f1f1e]/95 backdrop-blur-sm shadow-floating overflow-hidden animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 ${variantStyles.icon}`} />
                <h3 className="text-lg font-semibold text-white">
                  {state.title || "Are you sure?"}
                </h3>
              </div>
              <button
                onClick={() => handleClose(false)}
                className="text-white/60 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-white/80 leading-relaxed">{state.message}</p>
            </div>
            <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex items-center justify-end gap-3">
              <button
                onClick={() => handleClose(false)}
                className="px-4 py-2 rounded-xl border border-white/20 bg-transparent text-white text-sm font-medium hover:bg-white/10 transition"
              >
                {state.cancelText || "Cancel"}
              </button>
              <button
                onClick={() => handleClose(true)}
                className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition ${variantStyles.btn}`}
              >
                {state.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
