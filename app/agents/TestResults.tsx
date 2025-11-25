"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle } from "lucide-react";

interface TestResult {
  id: string;
  test_case_name?: string;
  status: "passed" | "failed";
  pass_rate: number;
  simulations_passed: number;
  simulations_failed: number;
  total_simulations: number;
  conditions_met?: string;
  failure_conditions?: string;
  created_at: string;
}

interface TestResultsProps {
  agentId: string;
}

export default function TestResults({ agentId }: TestResultsProps) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadResults();
  }, [agentId]);

  const loadResults = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}/test-results`);
      if (response.ok) {
        const data = await response.json();
        setResults(data);
      } else {
        // Mock data for demo
        setResults([
          {
            id: "1",
            test_case_name: "New account onboarding",
            status: "passed",
            pass_rate: 99,
            simulations_passed: 1240,
            simulations_failed: 10,
            total_simulations: 1250,
            conditions_met: "All conditions met",
            failure_conditions: "Failure conditions met",
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      console.error("Error loading test results:", error);
      // Mock data for demo
      setResults([
        {
          id: "1",
          test_case_name: "New account onboarding",
          status: "passed",
          pass_rate: 99,
          simulations_passed: 1240,
          simulations_failed: 10,
          total_simulations: 1250,
          conditions_met: "All conditions met",
          failure_conditions: "Failure conditions met",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/60">Loading test results...</div>
      </div>
    );
  }

  // Calculate aggregate stats
  const totalSimulations = results.reduce((sum, r) => sum + r.total_simulations, 0);
  const totalPassed = results.reduce((sum, r) => sum + r.simulations_passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.simulations_failed, 0);
  const overallPassRate = totalSimulations > 0 ? Math.round((totalPassed / totalSimulations) * 100) : 0;

  return (
    <div className="p-6 space-y-6 bg-[#1a1612]">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-2">Test results</h2>
      </div>

      {/* Summary Cards - GigaAI Style */}
      <div className="grid grid-cols-3 gap-6">
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <div className="text-sm text-white/60 mb-2">Pass Rate</div>
          <div className="text-5xl font-bold text-white mb-1">{overallPassRate}%</div>
          <div className="text-xs text-white/50">Based on {totalSimulations.toLocaleString()} simulations</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <div className="text-sm text-white/60 mb-2">Simulations passed</div>
          <div className="text-5xl font-bold text-green-400 mb-1">{totalPassed.toLocaleString()}</div>
          <div className="text-xs text-white/50">All conditions met</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <div className="text-sm text-white/60 mb-2">Simulations failed</div>
          <div className="text-5xl font-bold text-red-400 mb-1">{totalFailed.toLocaleString()}</div>
          <div className="text-xs text-white/50">Failure conditions met</div>
        </div>
      </div>

      {/* Test Cases Table - GigaAI Style */}
      {results.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
          <div className="border-b border-white/10 px-6 py-4">
            <h3 className="text-lg font-semibold text-white">Test Cases</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white/60">Test case</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white/60">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white/60">Pass rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {results.map((result) => (
                  <tr key={result.id} className="hover:bg-white/5 transition">
                    <td className="px-6 py-4 text-sm text-white">
                      {result.test_case_name || "Unnamed test case"}
                    </td>
                    <td className="px-6 py-4">
                      {result.status === "passed" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-300 text-xs">
                          <CheckCircle className="h-3 w-3" />
                          Passed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-300 text-xs">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-white">{result.pass_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/40 p-12 text-center">
          <p className="text-white/60 mb-4">No test results yet</p>
          <p className="text-sm text-white/50">Run tests to see performance metrics</p>
        </div>
      )}
    </div>
  );
}
