"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RailwayTestPage() {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async (action: string, testData?: any) => {
    setTesting(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch("/api/railway/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, testData }),
      });

      const data = await response.json();
      if (response.ok) {
        setResults(data);
      } else {
        setError(data.error || "Test failed");
        setResults(data);
      }
    } catch (err: any) {
      setError(err.message || "Failed to run test");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Railway Test</h1>
            <p className="text-gray-600">Test Railway connectivity and actions</p>
          </div>
          <button
            onClick={() => router.push("/select")}
            className="px-4 py-2 rounded-xl border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← Back
          </button>
        </div>

        {/* Test Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => runTest("health_check")}
            disabled={testing}
            className="p-6 bg-white rounded-2xl border-2 border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all text-left disabled:opacity-50"
          >
            <div className="text-lg font-semibold text-gray-900 mb-2">
              Health Check
            </div>
            <div className="text-sm text-gray-600">
              Check if Railway server is reachable and healthy
            </div>
          </button>

          <button
            onClick={() => runTest("test_connection")}
            disabled={testing}
            className="p-6 bg-white rounded-2xl border-2 border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all text-left disabled:opacity-50"
          >
            <div className="text-lg font-semibold text-gray-900 mb-2">
              Test Connection
            </div>
            <div className="text-sm text-gray-600">
              Test basic connectivity to Railway
            </div>
          </button>
        </div>

        {/* Results */}
        {(results || error) && (
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Results</h2>
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="text-red-800 font-semibold mb-1">Error</div>
                <div className="text-red-600 text-sm">{error}</div>
              </div>
            )}
            {results && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">Response:</div>
                  <pre className="p-4 bg-gray-50 rounded-xl text-xs overflow-x-auto">
                    {JSON.stringify(results, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Links */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Links</h2>
          <div className="space-y-2">
            <a
              href="/railway-logs"
              className="block p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="font-medium text-gray-900">View Railway Logs</div>
              <div className="text-sm text-gray-600">Real-time logs from Railway server</div>
            </a>
            <a
              href="/api/debug/check-railway"
              target="_blank"
              className="block p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="font-medium text-gray-900">Railway Health Check API</div>
              <div className="text-sm text-gray-600">Direct API endpoint for Railway status</div>
            </a>
          </div>
        </div>

        {testing && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 shadow-2xl">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <div className="text-lg font-semibold text-gray-900">Running test...</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
