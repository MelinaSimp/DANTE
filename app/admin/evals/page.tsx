"use client";

import { useEffect, useState } from "react";
import {
  FlaskConical,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Star,
  Send,
  Clock,
  Zap,
} from "lucide-react";
import { reportError } from "@/lib/report-error";

/* ── Types ─────────────────────────────────────────────────────── */

interface FBGrade {
  id: string;
  run_id: string;
  grader_kind: "auto" | "human";
  grader_id: string | null;
  answer_quality: number;
  source_reliability: number;
  notes: string | null;
  created_at: string;
}

interface FBRun {
  id: string;
  task_slug: string;
  task_version: string;
  model: string;
  output: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  auto_answer_quality: number | null;
  auto_source_reliability: number | null;
  auto_grade_notes: string | null;
  triggered_by: string;
  created_at: string;
  grades: FBGrade[];
  has_human_grade: boolean;
}

interface DanteRun {
  id: string;
  suite_id: string;
  suite_name: string;
  workspace_id: string;
  workspace_name: string;
  model: string | null;
  status: string;
  total_cases: number;
  passed: number;
  failed: number;
  score: number | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_tokens_in: number | null;
  total_tokens_out: number | null;
  estimated_cost_cents: number | null;
  notes: string | null;
  created_at: string;
}

interface Grader {
  id: string;
  display_name: string;
  credentials: string;
  bio: string | null;
  active: boolean;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtScore(n: number | null): string {
  if (n == null) return "--";
  return `${(n * 100).toFixed(0)}%`;
}

function fmtDuration(ms: number | null): string {
  if (!ms) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ScorePill({ score, label }: { score: number | null; label: string }) {
  if (score == null) return null;
  const pct = score * 100;
  const color =
    pct >= 80
      ? "text-[var(--verified)] bg-[var(--verified-soft)]"
      : pct >= 50
        ? "text-[var(--flag)] bg-[var(--flag-soft)]"
        : "text-[var(--danger)] bg-[var(--danger-soft)]";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}: {pct.toFixed(0)}%
    </span>
  );
}

/* ── Grade Form ────────────────────────────────────────────────── */

function GradeForm({
  runId,
  graders,
  onSubmit,
}: {
  runId: string;
  graders: Grader[];
  onSubmit: (grade: FBGrade) => void;
}) {
  const [answerQuality, setAnswerQuality] = useState("0.8");
  const [sourceReliability, setSourceReliability] = useState("0.8");
  const [graderId, setGraderId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const aq = parseFloat(answerQuality);
    const sr = parseFloat(sourceReliability);
    if (isNaN(aq) || aq < 0 || aq > 1) {
      setError("Answer quality must be 0.0-1.0");
      return;
    }
    if (isNaN(sr) || sr < 0 || sr > 1) {
      setError("Source reliability must be 0.0-1.0");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/evals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          run_id: runId,
          grader_id: graderId || null,
          answer_quality: aq,
          source_reliability: sr,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit grade");
        return;
      }
      const data = await res.json();
      onSubmit(data.grade);
      setNotes("");
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 p-3 rounded-[6px] bg-[var(--canvas-subtle)] border border-[var(--rule)]">
      <div className="text-xs font-medium text-[var(--ink)] mb-2">Submit Human Grade</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="label-section text-[10px]">Answer Quality (0-1)</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={answerQuality}
            onChange={(e) => setAnswerQuality(e.target.value)}
            className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="label-section text-[10px]">Source Reliability (0-1)</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={sourceReliability}
            onChange={(e) => setSourceReliability(e.target.value)}
            className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      </div>
      {graders.length > 0 && (
        <div className="mb-2">
          <label className="label-section text-[10px]">Grader</label>
          <select
            value={graderId}
            onChange={(e) => setGraderId(e.target.value)}
            className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            <option value="">Admin (self)</option>
            {graders.filter((g) => g.active).map((g) => (
              <option key={g.id} value={g.id}>
                {g.display_name} -- {g.credentials}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mb-2">
        <label className="label-section text-[10px]">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
          placeholder="Optional grading notes..."
        />
      </div>
      {error && (
        <div className="text-xs text-[var(--danger)] mb-2">{error}</div>
      )}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent)] text-white hover:opacity-90 transition disabled:opacity-50"
      >
        {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        Submit Grade
      </button>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────── */

type Tab = "fiduciary" | "dante";

export default function EvalsPage() {
  const [loading, setLoading] = useState(true);
  const [fbRuns, setFbRuns] = useState<FBRun[]>([]);
  const [danteRuns, setDanteRuns] = useState<DanteRun[]>([]);
  const [graders, setGraders] = useState<Grader[]>([]);
  const [tab, setTab] = useState<Tab>("fiduciary");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [grading, setGrading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/evals", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setFbRuns(data.fiduciary?.runs || []);
        setDanteRuns(data.dante?.runs || []);
        setGraders(data.graders || []);
      })
      .catch(reportError("admin/evals: load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleGradeSubmit = (runId: string, grade: FBGrade) => {
    setFbRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? { ...r, grades: [...r.grades, grade], has_human_grade: true }
          : r,
      ),
    );
    setGrading(null);
    setToast({ type: "success", message: "Grade submitted" });
  };

  // ── Stats ───────────────────────────────────────────────────
  const fbTotal = fbRuns.length;
  const fbGraded = fbRuns.filter((r) => r.has_human_grade).length;
  const fbUngraded = fbTotal - fbGraded;
  const fbAvgAnswer =
    fbRuns.length > 0
      ? fbRuns.reduce((s, r) => s + (r.auto_answer_quality || 0), 0) / fbRuns.length
      : 0;

  const danteTotal = danteRuns.length;
  const danteCompleted = danteRuns.filter((r) => r.status === "completed").length;
  const danteAvgScore =
    danteRuns.filter((r) => r.score != null).length > 0
      ? danteRuns
          .filter((r) => r.score != null)
          .reduce((s, r) => s + (r.score || 0), 0) /
        danteRuns.filter((r) => r.score != null).length
      : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--ink-muted)]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-[6px] text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-[var(--verified-soft)] text-[var(--verified)]"
              : "bg-[var(--danger-soft)] text-[var(--danger)]"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <FlaskConical className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.5} />
        <h1 className="heading-display text-lg">Evals</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card-flat p-4">
          <div className="label-section mb-1">FiduciaryBench Runs</div>
          <div className="text-2xl font-semibold text-[var(--ink)]">{fbTotal}</div>
          <div className="text-xs text-[var(--ink-muted)] mt-1">
            {fbGraded} graded, {fbUngraded} pending
          </div>
        </div>
        <div className="card-flat p-4">
          <div className="label-section mb-1">Avg Answer Quality</div>
          <div className="text-2xl font-semibold text-[var(--ink)]">
            {fbAvgAnswer > 0 ? `${(fbAvgAnswer * 100).toFixed(0)}%` : "--"}
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-1">Auto-graded (LLM)</div>
        </div>
        <div className="card-flat p-4">
          <div className="label-section mb-1">Dante Eval Runs</div>
          <div className="text-2xl font-semibold text-[var(--ink)]">{danteTotal}</div>
          <div className="text-xs text-[var(--ink-muted)] mt-1">
            {danteCompleted} completed
          </div>
        </div>
        <div className="card-flat p-4">
          <div className="label-section mb-1">Dante Avg Score</div>
          <div className="text-2xl font-semibold text-[var(--ink)]">
            {danteAvgScore > 0 ? `${(danteAvgScore * 100).toFixed(0)}%` : "--"}
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-1">Assertion + LLM judge</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[var(--rule)]">
        {(
          [
            { key: "fiduciary" as Tab, label: "FiduciaryBench", count: fbTotal },
            { key: "dante" as Tab, label: "Dante Eval Suites", count: danteTotal },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* ── FiduciaryBench Tab ──────────────────────────────────── */}
      {tab === "fiduciary" && (
        <div className="space-y-2">
          {fbRuns.length === 0 && (
            <div className="card-flat p-8 text-center text-sm text-[var(--ink-muted)]">
              No FiduciaryBench runs yet. Trigger one via POST /api/admin/eval/run.
            </div>
          )}
          {fbRuns.map((run) => {
            const isExpanded = expanded.has(run.id);
            return (
              <div key={run.id} className="card-flat">
                <button
                  onClick={() => toggleExpand(run.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--canvas-subtle)] transition rounded-[6px]"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--ink)]">
                        {run.task_slug}
                      </span>
                      <span className="text-xs text-[var(--ink-subtle)]">v{run.task_version}</span>
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--canvas-subtle)] text-[var(--ink-muted)]">
                        {run.model}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--ink-muted)]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDate(run.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {fmtDuration(run.duration_ms)}
                      </span>
                      {run.total_tokens && (
                        <span>{run.total_tokens.toLocaleString()} tokens</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ScorePill score={run.auto_answer_quality} label="AQ" />
                    <ScorePill score={run.auto_source_reliability} label="SR" />
                    {run.has_human_grade ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--verified)]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Graded
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[var(--flag)]">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Ungraded
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[var(--rule)] mt-1 pt-3">
                    {/* Output */}
                    <div className="mb-3">
                      <div className="label-section text-[10px] mb-1">Model Output</div>
                      <div className="p-3 rounded bg-[var(--canvas-subtle)] text-xs text-[var(--ink)] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed">
                        {run.output}
                      </div>
                    </div>

                    {/* Auto grade notes */}
                    {run.auto_grade_notes && (
                      <div className="mb-3">
                        <div className="label-section text-[10px] mb-1">Auto-Grade Reasoning</div>
                        <div className="p-2 rounded bg-[var(--canvas-subtle)] text-xs text-[var(--ink-muted)] whitespace-pre-wrap">
                          {run.auto_grade_notes}
                        </div>
                      </div>
                    )}

                    {/* Existing grades */}
                    {run.grades.length > 0 && (
                      <div className="mb-3">
                        <div className="label-section text-[10px] mb-1">Grades</div>
                        <div className="space-y-1">
                          {run.grades.map((g) => (
                            <div
                              key={g.id}
                              className="flex items-center gap-3 px-2 py-1.5 rounded bg-[var(--canvas-subtle)] text-xs"
                            >
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  g.grader_kind === "human"
                                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                    : "bg-[var(--canvas)] text-[var(--ink-muted)]"
                                }`}
                              >
                                {g.grader_kind}
                              </span>
                              <ScorePill score={g.answer_quality} label="AQ" />
                              <ScorePill score={g.source_reliability} label="SR" />
                              {g.notes && (
                                <span className="text-[var(--ink-muted)] truncate max-w-[200px]">
                                  {g.notes}
                                </span>
                              )}
                              <span className="ml-auto text-[var(--ink-subtle)]">
                                {fmtDate(g.created_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Grade button / form */}
                    {grading === run.id ? (
                      <GradeForm
                        runId={run.id}
                        graders={graders}
                        onSubmit={(g) => handleGradeSubmit(run.id, g)}
                      />
                    ) : (
                      <button
                        onClick={() => setGrading(run.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition"
                      >
                        <Star className="w-3 h-3" />
                        Add Human Grade
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dante Eval Tab ──────────────────────────────────────── */}
      {tab === "dante" && (
        <div className="space-y-2">
          {danteRuns.length === 0 && (
            <div className="card-flat p-8 text-center text-sm text-[var(--ink-muted)]">
              No Dante eval runs yet. Seed suites via POST /api/dante/evals/seed, then trigger runs.
            </div>
          )}
          {danteRuns.map((run) => {
            const isExpanded = expanded.has(run.id);
            const passRate =
              run.total_cases > 0 ? run.passed / run.total_cases : null;
            return (
              <div key={run.id} className="card-flat">
                <button
                  onClick={() => toggleExpand(run.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--canvas-subtle)] transition rounded-[6px]"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--ink)]">
                        {run.suite_name}
                      </span>
                      {run.model && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--canvas-subtle)] text-[var(--ink-muted)]">
                          {run.model}
                        </span>
                      )}
                      <span className="text-xs text-[var(--ink-subtle)]">
                        {run.workspace_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--ink-muted)]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDate(run.started_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {fmtDuration(run.duration_ms)}
                      </span>
                      {run.estimated_cost_cents != null && run.estimated_cost_cents > 0 && (
                        <span>${(run.estimated_cost_cents / 100).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status badge */}
                    <span
                      className={`px-2 py-0.5 text-[10px] rounded font-medium ${
                        run.status === "completed"
                          ? "bg-[var(--verified-soft)] text-[var(--verified)]"
                          : run.status === "running"
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : run.status === "failed"
                              ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                              : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)]"
                      }`}
                    >
                      {run.status}
                    </span>
                    {/* Pass/Fail */}
                    <div className="flex items-center gap-1 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verified)]" />
                      <span className="text-[var(--ink-muted)]">{run.passed}</span>
                      <XCircle className="w-3.5 h-3.5 text-[var(--danger)] ml-1" />
                      <span className="text-[var(--ink-muted)]">{run.failed}</span>
                    </div>
                    {/* Score */}
                    {run.score != null && (
                      <ScorePill score={run.score} label="Score" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[var(--rule)] mt-1 pt-3">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <div className="label-section text-[10px] mb-1">Cases</div>
                        <div className="text-[var(--ink)]">
                          {run.passed}/{run.total_cases} passed
                          {passRate != null && ` (${(passRate * 100).toFixed(0)}%)`}
                        </div>
                      </div>
                      <div>
                        <div className="label-section text-[10px] mb-1">Tokens</div>
                        <div className="text-[var(--ink)]">
                          {(run.total_tokens_in || 0).toLocaleString()} in /{" "}
                          {(run.total_tokens_out || 0).toLocaleString()} out
                        </div>
                      </div>
                      <div>
                        <div className="label-section text-[10px] mb-1">Duration</div>
                        <div className="text-[var(--ink)]">{fmtDuration(run.duration_ms)}</div>
                      </div>
                    </div>
                    {run.notes && (
                      <div className="mt-3">
                        <div className="label-section text-[10px] mb-1">Notes</div>
                        <div className="p-2 rounded bg-[var(--canvas-subtle)] text-xs text-[var(--ink-muted)]">
                          {run.notes}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Graders Directory ──────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--ink)] mb-3">Grader Directory</h2>
        {graders.length === 0 ? (
          <div className="card-flat p-6 text-center text-sm text-[var(--ink-muted)]">
            No graders registered yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {graders.map((g) => (
              <div key={g.id} className="card-flat p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--ink)]">{g.display_name}</span>
                  {g.active ? (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--verified-soft)] text-[var(--verified)]">
                      active
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--canvas-subtle)] text-[var(--ink-muted)]">
                      inactive
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--ink-muted)] mt-0.5">{g.credentials}</div>
                {g.bio && (
                  <div className="text-xs text-[var(--ink-subtle)] mt-1">{g.bio}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
