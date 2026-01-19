"use client";

import { useState, useEffect } from "react";

interface StatusCheck {
  name: string;
  status: "checking" | "healthy" | "unhealthy" | "error";
  message: string;
  details?: any;
}

export default function StatusPage() {
  const [checks, setChecks] = useState<StatusCheck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAllServices();
  }, []);

  async function checkAllServices() {
    setLoading(true);
    const newChecks: StatusCheck[] = [];

    // Check Railway Server
    try {
      const railwayResponse = await fetch("/api/debug/check-railway");
      const railwayData = await railwayResponse.json();
      
      newChecks.push({
        name: "Railway Media Stream Server",
        status: railwayData.status?.includes("✅") ? "healthy" : "unhealthy",
        message: railwayData.status || railwayData.error || "Unknown status",
        details: railwayData,
      });
    } catch (error: any) {
      newChecks.push({
        name: "Railway Media Stream Server",
        status: "error",
        message: error.message || "Failed to check Railway server",
      });
    }

    // Check Executor Version
    try {
      const executorResponse = await fetch("/api/debug/check-executor-code");
      const executorData = await executorResponse.json();
      
      newChecks.push({
        name: "Agent Executor",
        status: executorData.hasFixedCode ? "healthy" : "unhealthy",
        message: `Version: ${executorData.executorVersion || "Unknown"}`,
        details: executorData,
      });
    } catch (error: any) {
      newChecks.push({
        name: "Agent Executor",
        status: "error",
        message: error.message || "Failed to check executor",
      });
    }

    // Check Environment Variables
    try {
      const envResponse = await fetch("/api/debug/env-check");
      const envData = await envResponse.json();
      
      newChecks.push({
        name: "Environment Variables",
        status: envData.status === "ok" ? "healthy" : "unhealthy",
        message: envData.message || "Environment check completed",
        details: envData,
      });
    } catch (error: any) {
      newChecks.push({
        name: "Environment Variables",
        status: "error",
        message: error.message || "Failed to check environment",
      });
    }

    // Check if we can reach Railway directly
    try {
      const railwayHealthUrl = "https://motivated-perfection-production.up.railway.app/health";
      const healthResponse = await fetch(railwayHealthUrl, { 
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      
      const healthData = await healthResponse.json().catch(() => null);
      
      newChecks.push({
        name: "Railway Health Endpoint",
        status: healthResponse.ok ? "healthy" : "unhealthy",
        message: healthData?.status || `Status: ${healthResponse.status}`,
        details: healthData,
      });
    } catch (error: any) {
      newChecks.push({
        name: "Railway Health Endpoint",
        status: "error",
        message: error.message || "Failed to reach Railway health endpoint",
      });
    }

    setChecks(newChecks);
    setLoading(false);
  }

  function getStatusColor(status: StatusCheck["status"]) {
    switch (status) {
      case "healthy":
        return "bg-green-100 text-green-800 border-green-300";
      case "unhealthy":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "error":
        return "bg-red-100 text-red-800 border-red-300";
      case "checking":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  }

  function getStatusIcon(status: StatusCheck["status"]) {
    switch (status) {
      case "healthy":
        return "✅";
      case "unhealthy":
        return "⚠️";
      case "error":
        return "❌";
      case "checking":
        return "⏳";
      default:
        return "❓";
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">System Status</h1>
          <p className="text-gray-600">Check the health of all system components</p>
        </div>

        <div className="space-y-4">
          {loading && checks.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="text-gray-600">Checking services...</span>
              </div>
            </div>
          ) : (
            checks.map((check, index) => (
              <div
                key={index}
                className={`bg-white rounded-lg shadow-sm border-2 p-6 ${getStatusColor(check.status)}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getStatusIcon(check.status)}</span>
                    <h2 className="text-xl font-semibold">{check.name}</h2>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    check.status === "healthy" ? "bg-green-200 text-green-900" :
                    check.status === "unhealthy" ? "bg-yellow-200 text-yellow-900" :
                    check.status === "error" ? "bg-red-200 text-red-900" :
                    "bg-gray-200 text-gray-900"
                  }`}>
                    {check.status.toUpperCase()}
                  </span>
                </div>
                
                <p className="mb-2">{check.message}</p>
                
                {check.details && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium hover:underline">
                      View Details
                    </summary>
                    <pre className="mt-2 p-4 bg-black/10 rounded text-xs overflow-auto max-h-60">
                      {JSON.stringify(check.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-3">Quick Links</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <a
              href="/api/debug/check-railway"
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              Railway Check (JSON)
            </a>
            <a
              href="/api/debug/check-executor-code"
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              Executor Check (JSON)
            </a>
            <a
              href="https://motivated-perfection-production.up.railway.app/health"
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              Railway Health (Direct)
            </a>
            <a
              href="https://vercel.com/drift4/drift-crm/logs"
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              Vercel Logs
            </a>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={checkAllServices}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Checking..." : "Refresh Status"}
          </button>
        </div>
      </div>
    </div>
  );
}
