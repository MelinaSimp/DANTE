"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface TestResultsProps {
  agentId: string;
}

interface TestResult {
  id: string;
  test_case_name: string;
  status: "passed" | "failed";
  pass_rate: number;
  simulations_passed: number;
  simulations_failed: number;
  total_simulations: number;
  conditions_met?: string;
  failure_conditions?: string;
}

export default function TestResults({ agentId }: TestResultsProps) {
  const { colors } = useTheme();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTestResults() {
      setLoading(true);
      try {
        const response = await fetch(`/api/agents/${agentId}/test-results`);
        if (response.ok) {
          const data = await response.json();
          setTestResults(data);
        }
      } catch (error) {
        console.error("Failed to load test results:", error);
      } finally {
        setLoading(false);
      }
    }
    loadTestResults();
  }, [agentId]);

  // Calculate aggregate stats
  const stats = testResults.reduce(
    (acc, result) => {
      acc.totalSimulations += result.total_simulations || 0;
      acc.simulationsPassed += result.simulations_passed || 0;
      acc.simulationsFailed += result.simulations_failed || 0;
      return acc;
    },
    { totalSimulations: 0, simulationsPassed: 0, simulationsFailed: 0 }
  );

  const passRate = stats.totalSimulations > 0
    ? Math.round((stats.simulationsPassed / stats.totalSimulations) * 100)
    : 0;

  return (
    <div className={`p-6 space-y-6 ${colors.bg}`}>
      <div>
        <h2 className={`text-2xl font-semibold ${colors.text} mb-2`}>Test results</h2>
      </div>

      {loading ? (
        <div className={`text-center ${colors.textTertiary} py-12`}>Loading test results...</div>
      ) : (
        <>
          {/* Summary Cards - Drift Style */}
          <div className="grid grid-cols-3 gap-6">
            <div className={`rounded-xl border ${colors.border} bg-[#242423] p-6`}>
              <div className={`text-sm ${colors.textTertiary} mb-2`}>Pass Rate</div>
              <div className={`text-5xl font-bold ${colors.text} mb-1`}>{passRate}%</div>
              <div className={`text-xs ${colors.textTertiary}`}>Based on {stats.totalSimulations.toLocaleString()} simulations</div>
            </div>

            <div className={`rounded-xl border ${colors.border} bg-[#242423] p-6`}>
              <div className={`text-sm ${colors.textTertiary} mb-2`}>Simulations passed</div>
              <div className="text-5xl font-bold text-green-400 mb-1">{stats.simulationsPassed.toLocaleString()}</div>
              <div className={`text-xs ${colors.textTertiary}`}>All conditions met</div>
            </div>

            <div className={`rounded-xl border ${colors.border} bg-[#242423] p-6`}>
              <div className={`text-sm ${colors.textTertiary} mb-2`}>Simulations failed</div>
              <div className="text-5xl font-bold text-red-400 mb-1">{stats.simulationsFailed.toLocaleString()}</div>
              <div className={`text-xs ${colors.textTertiary}`}>Failure conditions met</div>
            </div>
          </div>

          {/* Test Cases Table - Drift Style */}
          <div className={`rounded-xl border ${colors.border} bg-[#242423] overflow-hidden`}>
            <div className={`border-b ${colors.border} px-6 py-4`}>
              <h3 className={`text-lg font-semibold ${colors.text}`}>Test Cases</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`border-b ${colors.border}`}>
                  <tr>
                    <th className={`px-6 py-4 text-left text-sm font-medium ${colors.textTertiary}`}>Test case</th>
                    <th className={`px-6 py-4 text-left text-sm font-medium ${colors.textTertiary}`}>Status</th>
                    <th className={`px-6 py-4 text-left text-sm font-medium ${colors.textTertiary}`}>Pass rate</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${colors.border}`}>
                  {testResults.length === 0 ? (
                    <tr>
                      <td colSpan={3} className={`px-6 py-8 text-center ${colors.textTertiary} text-sm`}>
                        No test results yet. Run tests to see results here.
                      </td>
                    </tr>
                  ) : (
                    testResults.map((result) => (
                      <tr key={result.id} className={`hover:${colors.hover} transition`}>
                        <td className={`px-6 py-4 text-sm ${colors.text}`}>
                          {result.test_case_name || "Unnamed Test Case"}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                            result.status === "passed"
                              ? "bg-green-500/20 text-green-300"
                              : "bg-red-500/20 text-red-300"
                          }`}>
                            {result.status === "passed" ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {result.status === "passed" ? "Passed" : "Failed"}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-sm ${colors.text}`}>
                          {result.pass_rate ? `${result.pass_rate}%` : "N/A"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

