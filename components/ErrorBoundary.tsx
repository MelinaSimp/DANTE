"use client";

import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    console.error("Component stack:", errorInfo.componentStack);
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error;
      return (
        <div style={{ padding: "20px", color: "red", backgroundColor: "#1a1a1a", minHeight: "100vh" }}>
          <h2 style={{ color: "red", fontSize: "24px", marginBottom: "20px" }}>Something went wrong</h2>
          <div style={{ marginBottom: "20px" }}>
            <strong>Error Message:</strong>
            <pre style={{ backgroundColor: "#2a2a2a", padding: "10px", borderRadius: "4px", overflow: "auto" }}>
              {error?.message || "Unknown error"}
            </pre>
          </div>
          <div style={{ marginBottom: "20px" }}>
            <strong>Stack Trace:</strong>
            <pre style={{ backgroundColor: "#2a2a2a", padding: "10px", borderRadius: "4px", overflow: "auto", maxHeight: "400px" }}>
              {error?.stack || "No stack trace available"}
            </pre>
          </div>
          <div style={{ marginBottom: "20px" }}>
            <strong>Error Name:</strong>
            <pre style={{ backgroundColor: "#2a2a2a", padding: "10px", borderRadius: "4px" }}>
              {error?.name || "Unknown"}
            </pre>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: "10px 20px", backgroundColor: "#3351ff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
