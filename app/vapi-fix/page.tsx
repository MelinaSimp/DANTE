"use client";

import { useState } from "react";

export default function VapiFixPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFix = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/vapi/fix-config", {
        method: "GET",
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text.substring(0, 200)}`);
      }

      if (!response.ok) {
        const errorMsg = data.error || data.message || "Failed to fix configuration";
        const details = data.details || data.vapiApiKeySet !== undefined ? 
          `Key exists: ${data.vapiApiKeySet}, Length: ${data.vapiApiKeyLength}` : '';
        throw new Error(`${errorMsg}${details ? ` (${details})` : ''}`);
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
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6">Auto-Fix Vapi Configuration</h1>
        <p className="text-gray-600 mb-6">
          This will automatically diagnose and fix your Vapi configuration to ensure it uses your webhook for real-time conversations.
        </p>

        <button
          onClick={handleFix}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors mb-6"
        >
          {loading ? "Diagnosing and Fixing..." : "🔧 Diagnose & Fix Configuration"}
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
          <div className="mt-6 space-y-6">
            {/* Success Message */}
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <h3 className="text-green-800 font-medium mb-2">✅ Configuration Fixed!</h3>
              <p className="text-green-700 text-sm">{result.message}</p>
            </div>

            {/* Diagnosis Results */}
            {result.diagnosis && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Assistant:</h3>
                  <p className="text-sm text-gray-700">
                    <strong>ID:</strong> {result.diagnosis.assistantId}<br />
                    <strong>Name:</strong> {result.diagnosis.assistantName}
                  </p>
                </div>

                {result.diagnosis.issues && result.diagnosis.issues.length > 0 && result.diagnosis.issues[0] !== "None" && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                    <h4 className="text-red-800 font-medium mb-2">❌ Issues Found:</h4>
                    <ul className="text-red-700 text-sm list-disc list-inside space-y-1">
                      {result.diagnosis.issues.map((issue: string, index: number) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.diagnosis.warnings && result.diagnosis.warnings.length > 0 && result.diagnosis.warnings[0] !== "None" && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <h4 className="text-yellow-800 font-medium mb-2">⚠️ Warnings:</h4>
                    <ul className="text-yellow-700 text-sm list-disc list-inside space-y-1">
                      {result.diagnosis.warnings.map((warning: string, index: number) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.diagnosis.fixes && result.diagnosis.fixes.length > 0 && result.diagnosis.fixes[0] !== "No changes needed" && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                    <h4 className="text-blue-800 font-medium mb-2">🔧 Fixes Applied:</h4>
                    <ul className="text-blue-700 text-sm list-disc list-inside space-y-1">
                      {result.diagnosis.fixes.map((fix: string, index: number) => (
                        <li key={index}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.diagnosis.results && Object.keys(result.diagnosis.results).length > 0 && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                    <h4 className="text-green-800 font-medium mb-2">✅ Correct Configurations:</h4>
                    <ul className="text-green-700 text-sm list-disc list-inside space-y-1">
                      {Object.values(result.diagnosis.results).map((result: any, index: number) => (
                        <li key={index}>{result}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.configuration && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                    <h4 className="text-gray-800 font-medium mb-2">📋 Final Configuration:</h4>
                    <div className="text-sm text-gray-700 space-y-1">
                      <p><strong>Model:</strong> {result.configuration.model === null ? "null ✅ (Server URL mode)" : JSON.stringify(result.configuration.model)}</p>
                      <p><strong>Server URL:</strong> {result.configuration.serverUrl}</p>
                      <p><strong>First Message:</strong> {result.configuration.firstMessage}</p>
                      <p><strong>First Message Mode:</strong> {result.configuration.firstMessageMode}</p>
                      <p><strong>Voice:</strong> {result.configuration.voice?.provider || "Not set"} ({result.configuration.voice?.voiceId || "no ID"})</p>
                    </div>
                  </div>
                )}

                {result.diagnosis.phoneNumber && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                    <h4 className="text-gray-800 font-medium mb-2">📞 Phone Number:</h4>
                    <div className="text-sm text-gray-700 space-y-1">
                      <p><strong>Number:</strong> {result.diagnosis.phoneNumber.number || result.diagnosis.phoneNumber.id}</p>
                      <p><strong>Server URL:</strong> {result.diagnosis.phoneNumber.currentServerUrl || "Not set"}</p>
                      {result.diagnosis.phoneNumber.updated && (
                        <p className="text-green-600">✅ Phone number Server URL updated</p>
                      )}
                    </div>
                  </div>
                )}

                {result.nextSteps && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                    <h4 className="text-blue-800 font-medium mb-2">🧪 Next Steps:</h4>
                    <ol className="text-blue-700 text-sm list-decimal list-inside space-y-1">
                      {result.nextSteps.map((step: string, index: number) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                  <h4 className="text-yellow-800 font-medium mb-2">⚠️ Important:</h4>
                  <p className="text-yellow-700 text-sm">
                    If you still only see "end-of-call-report" in logs after testing, there might be additional settings in the Vapi dashboard that can't be changed via API. Check for "Server Messages/Events" toggles in the dashboard.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
