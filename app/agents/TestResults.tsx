"use client";

// Test-results tab — aggregate pass-rate cards + per-test-case table.
// Harvey-ized Apr 2026: flat white stat cells with label-section headers,
// editorial serif for the big numbers, no gradient pills. Passed/failed
// rendered with chip-verified / chip-flag to match the rest of the app.

import { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

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
        // Demo data fallback — clearly labeled via the demo tag below.
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
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--ink-muted)" }}
      >
        <span className="mono text-xs">Loading test results…</span>
      </div>
    );
  }

  const totalSimulations = results.reduce(
    (sum, r) => sum + r.total_simulations,
    0
  );
  const totalPassed = results.reduce((sum, r) => sum + r.simulations_passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.simulations_failed, 0);
  const overallPassRate =
    totalSimulations > 0
      ? Math.round((totalPassed / totalSimulations) * 100)
      : 0;

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div
          className="label-section mb-1"
          style={{ color: "var(--ink-subtle)" }}
        >
          Evaluation
        </div>
        <h2
          className="heading-display"
          style={{ fontSize: 28, color: "var(--ink)" }}
        >
          Test results
        </h2>
        <p
          className="text-xs mt-1 mono"
          style={{ color: "var(--ink-subtle)" }}
        >
          Demo data · wire to /api/agents/[id]/test-results for live
        </p>
      </div>

      {/* Summary cards */}
      <div
        className="card-flat overflow-hidden"
        style={{ background: "var(--canvas)" }}
      >
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: "var(--rule)" }}>
          <StatCell
            label="Pass rate"
            value={`${overallPassRate}%`}
            sub={`Across ${totalSimulations.toLocaleString()} simulations`}
          />
          <StatCell
            label="Passed"
            value={totalPassed.toLocaleString()}
            sub="All conditions met"
            valueColor="var(--verified)"
          />
          <StatCell
            label="Failed"
            value={totalFailed.toLocaleString()}
            sub="Failure conditions met"
            valueColor="var(--danger)"
          />
        </div>
      </div>

      {/* Test cases table */}
      {results.length > 0 ? (
        <div
          className="card-flat overflow-hidden"
          style={{ background: "var(--canvas)" }}
        >
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--rule)" }}
          >
            <div
              className="label-section"
              style={{ color: "var(--ink-muted)" }}
            >
              Test cases
            </div>
            <div
              className="mono text-xs"
              style={{ color: "var(--ink-subtle)" }}
            >
              {results.length} total
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                  <Th>Test case</Th>
                  <Th>Status</Th>
                  <Th align="right">Pass rate</Th>
                  <Th align="right">Simulations</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
                  <tr
                    key={result.id}
                    style={{
                      borderTop:
                        idx === 0 ? undefined : "1px solid var(--rule)",
                    }}
                  >
                    <Td>
                      <span style={{ color: "var(--ink)", fontWeight: 500 }}>
                        {result.test_case_name || "Unnamed test case"}
                      </span>
                    </Td>
                    <Td>
                      {result.status === "passed" ? (
                        <span className="chip-verified inline-flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Passed
                        </span>
                      ) : (
                        <span className="chip-flag inline-flex items-center gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Failed
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className="mono tabular-nums">
                        {result.pass_rate}%
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="mono tabular-nums"
                        style={{ color: "var(--ink-muted)" }}
                      >
                        {result.simulations_passed.toLocaleString()} /{" "}
                        {result.total_simulations.toLocaleString()}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div
          className="card-flat px-8 py-12 text-center"
          style={{ background: "var(--canvas)" }}
        >
          <div
            className="label-section mb-1.5"
            style={{ color: "var(--ink-subtle)" }}
          >
            Nothing to show
          </div>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            Run tests to see performance metrics.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div className="px-5 py-5" style={{ borderColor: "var(--rule)" }}>
      <div
        className="label-section mb-2"
        style={{ color: "var(--ink-muted)" }}
      >
        {label}
      </div>
      <div
        className="heading-display mb-1"
        style={{
          fontSize: 40,
          color: valueColor || "var(--ink)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        className="text-xs"
        style={{ color: "var(--ink-subtle)" }}
      >
        {sub}
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="label-section px-4 py-3"
      style={{
        color: "var(--ink-subtle)",
        textAlign: align,
        fontSize: 10,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="px-4 py-3 text-sm"
      style={{ color: "var(--ink)", textAlign: align }}
    >
      {children}
    </td>
  );
}
