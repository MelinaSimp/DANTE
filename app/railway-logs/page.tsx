"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Log {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  metadata?: any;
}

export default function RailwayLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("level", filter);
      }
      params.set("limit", "200");

      const response = await fetch(`/api/railway/logs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(() => {
      if (autoRefresh) {
        fetchLogs();
      }
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, filter]);

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
        return "text-red-600 bg-red-50 border-red-200";
      case "warn":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "info":
        return "text-blue-600 bg-blue-50 border-blue-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Railway Logs</h1>
            <p className="text-gray-600">Real-time logs from Railway WebSocket server</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/select")}
              className="px-4 py-2 rounded-xl border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700">Auto-refresh</span>
            </label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2 rounded-xl border-2 border-gray-300 text-gray-700 bg-white"
            >
              <option value="all">All Levels</option>
              <option value="error">Errors Only</option>
              <option value="warn">Warnings</option>
              <option value="info">Info</option>
            </select>
            <button
              onClick={fetchLogs}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-4 border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Total Logs</div>
            <div className="text-2xl font-bold text-gray-900">{logs.length}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Errors</div>
            <div className="text-2xl font-bold text-red-600">
              {logs.filter((l) => l.level === "error").length}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Warnings</div>
            <div className="text-2xl font-bold text-yellow-600">
              {logs.filter((l) => l.level === "warn").length}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Info</div>
            <div className="text-2xl font-bold text-blue-600">
              {logs.filter((l) => l.level === "info").length}
            </div>
          </div>
        </div>

        {/* Logs */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No logs yet. Make a call to see Railway activity.
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    getLevelColor(log.level)
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <span
                        className={`px-2 py-1 rounded-lg text-xs font-semibold border ${
                          getLevelColor(log.level)
                        }`}
                      >
                        {log.level.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500 font-mono">
                          {formatTime(log.timestamp)}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        {log.message}
                      </div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                            View metadata
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
