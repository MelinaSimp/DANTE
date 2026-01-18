"use client";

import { useState } from "react";

export default function VapiConfigurePage() {
  const [assistantId, setAssistantId] = useState("67b7fd78-da19-409e-9fd9-c87edf19c3eb");
  const [serverUrl, setServerUrl] = useState(
    typeof window !== "undefined" 
      ? `${window.location.origin}/api/vapi/webhook`
      : "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook"
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfigure = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/vapi/configure-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId,
          serverUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to configure assistant");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6">Configure Vapi Assistant</h1>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assistant ID
            </label>
            <input
              type="text"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="67b7fd78-da19-409e-9fd9-c87edf19c3eb"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Server URL (Webhook)
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="https://your-domain.com/api/vapi/webhook"
            />
          </div>
        </div>

        <button
          onClick={handleConfigure}
          disabled={loading || !assistantId || !serverUrl}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Configuring..." : "Configure Assistant"}
        </button>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <h3 className="text-red-800 font-medium mb-2">Error</h3>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <h3 className="text-green-800 font-medium mb-2">✅ Success!</h3>
            <div className="text-green-700 text-sm space-y-2">
              <p><strong>Assistant ID:</strong> {result.assistant?.id}</p>
              <p><strong>Name:</strong> {result.assistant?.name}</p>
              <p><strong>Server URL:</strong> {result.assistant?.serverUrl}</p>
            </div>
            <p className="text-green-600 text-sm mt-4">
              Your assistant is now configured to use your webhook! Test it by making a call.
            </p>
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h3 className="text-blue-800 font-medium mb-2">What this does:</h3>
          <ul className="text-blue-700 text-sm space-y-1 list-disc list-inside">
            <li>Clears the system prompt and messages</li>
            <li>Sets the Server URL to your webhook</li>
            <li>Configures the assistant to use request-start messages</li>
            <li>Forces Vapi to use your webhook instead of its default model</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
