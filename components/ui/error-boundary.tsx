"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundaryClass extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] flex items-center justify-center p-4">
          <div className="max-w-2xl w-full card-flat p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-12 w-12 rounded-full bg-[var(--danger-soft)] flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-[var(--danger)]" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-[var(--ink)]">Something went wrong</h1>
                <p className="text-[var(--ink-muted)] mt-1">This view hit an error — your data is safe.</p>
              </div>
            </div>

            {this.state.error && (
              <div className="bg-[var(--canvas-subtle)] rounded-[var(--r-card)] p-4 mb-6 border border-[var(--rule)]">
                <div className="text-sm font-mono text-[var(--danger)] mb-2 break-words">
                  {this.state.error.name}: {this.state.error.message}
                </div>
                {this.state.errorInfo && (
                  <details className="mt-2">
                    <summary className="text-sm text-[var(--ink-muted)] cursor-pointer hover:text-[var(--ink)]">
                      Technical details
                    </summary>
                    <pre className="mt-2 text-xs text-[var(--ink-subtle)] overflow-auto max-h-48 p-2 bg-[var(--canvas)] rounded border border-[var(--rule)]">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--r-input)] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 transition"
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                Reload
              </button>
              <button
                onClick={() => { if (typeof window !== "undefined") window.history.back(); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--r-input)] border border-[var(--rule)] text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
              >
                Go back
              </button>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--r-input)] border border-[var(--rule)] text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <Home className="h-4 w-4" strokeWidth={1.5} />
                Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundaryClass as ErrorBoundary };

