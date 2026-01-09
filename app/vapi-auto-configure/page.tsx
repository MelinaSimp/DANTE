"use client";

import { useState, useEffect } from "react";

export default function VapiAutoConfigurePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAutoConfigure = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/vapi/auto-configure", {
        method: "GET",
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
        <h1 className="text-3xl font-bold mb-6">Auto-Configure Vapi Assistant</h1>
        <p className="text-gray-600 mb-6">
          This will automatically configure your first Vapi assistant with:
        </p>
        
        <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
          <li>Server URL mode (model: null)</li>
          <li>Your webhook endpoint</li>
          <li>ElevenLabs voice settings</li>
          <li>Phone number server URL (if linked)</li>
        </ul>

        <button
          onClick={handleAutoConfigure}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Configuring..." : "Auto-Configure Assistant"}
        </button>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <h3 className="text-red-800 font-medium mb-2">❌ Error</h3>
            <p className="text-red-600 text-sm">{error}</p>
            {error.includes("VAPI_API_KEY") && (
              <p className="text-red-600 text-sm mt-2">
                💡 Make sure VAPI_API_KEY is set in Vercel environment variables.
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <h3 className="text-green-800 font-medium mb-4">✅ Success!</h3>
            
            <div className="text-green-700 text-sm space-y-2 mb-4">
              <p><strong>Assistant ID:</strong> {result.assistant?.id}</p>
              <p><strong>Name:</strong> {result.assistant?.name}</p>
              <p><strong>Server URL:</strong> {result.assistant?.serverUrl}</p>
              <p><strong>Model:</strong> {result.assistant?.model === null ? "null (Server URL mode ✅)" : JSON.stringify(result.assistant?.model)}</p>
              <p><strong>Voice Provider:</strong> {result.assistant?.voice?.provider || "Not set"}</p>
              <p><strong>Voice ID:</strong> {result.assistant?.voice?.voiceId || "Not set"}</p>
              {result.phoneNumber && (
                <>
                  <p><strong>Phone Number:</strong> {result.phoneNumber.number || result.phoneNumber.id}</p>
                  <p><strong>Phone Server URL:</strong> {result.phoneNumber.serverUrl || "Not updated"}</p>
                </>
              )}
            </div>

            {result.nextSteps && (
              <div className="mt-4 pt-4 border-t border-green-200">
                <h4 className="text-green-800 font-medium mb-2">🧪 Next Steps:</h4>
                <ul className="text-green-700 text-sm space-y-1 list-disc list-inside">
                  {result.nextSteps.map((step: string, index: number) => (
                    <li key={index}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h3 className="text-blue-800 font-medium mb-2">What this does:</h3>
          <ul className="text-blue-700 text-sm space-y-1 list-disc list-inside">
            <li>Lists your Vapi assistants</li>
            <li>Configures the first one automatically</li>
            <li>Sets model to null (forces Server URL mode)</li>
            <li>Sets webhook URL to your production domain</li>
            <li>Keeps ElevenLabs voice settings</li>
            <li>Updates phone number server URL if linked</li>
          </ul>
        </div>

        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="text-yellow-800 font-medium mb-2">⚠️ Requirements:</h3>
          <ul className="text-yellow-700 text-sm space-y-1 list-disc list-inside">
            <li>VAPI_API_KEY must be set in Vercel environment variables</li>
            <li>At least one assistant must exist in Vapi dashboard</li>
            <li>Deployment must be live on Vercel</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
