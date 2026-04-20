"use client";

import { useMemo, useState } from "react";
import { PlusIcon, ArrowUpAZIcon, ArrowDownAZIcon, TrashIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";

type Question = {
  id: string;
  prompt: string;
  expected_response: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

type Settings = {
  greeting: string;
  farewell: string;
  twilio_phone_number: string | null;
};

interface Props {
  workspaceId: string;
  initialQuestions: Question[];
  initialSettings: Settings;
}

export default function QuestionManager({ workspaceId: _workspaceId, initialQuestions, initialSettings }: Props) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.sort_order - b.sort_order),
    [questions]
  );

  function showMessage(msg: string, isError = false) {
    if (isError) {
      setError(msg);
      setSuccess(null);
    } else {
      setSuccess(msg);
      setError(null);
    }
    setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 4000);
  }

  async function createQuestion() {
    setLoading(true);
    try {
      const resp = await fetch("/api/receptionist/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "What is your name?",
          expected_response: "open",
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        showMessage(data.error || "Failed to create question", true);
        return;
      }
      setQuestions((prev) => [...prev, data.question]);
      showMessage("Question added");
    } catch (err) {
      console.error(err);
      showMessage("Failed to create question", true);
    } finally {
      setLoading(false);
    }
  }

  async function updateQuestion(id: string, updates: Partial<Question>) {
    const original = questions.find((q) => q.id === id);
    if (!original) return;

    const optimistic = questions.map((q) => (q.id === id ? { ...q, ...updates } : q));
    setQuestions(optimistic);

    try {
      const resp = await fetch(`/api/receptionist/questions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        showMessage(data.error || "Failed to update question", true);
        setQuestions(questions);
      } else {
        showMessage("Question updated");
      }
    } catch (err) {
      console.error(err);
      setQuestions(questions);
      showMessage("Failed to update question", true);
    }
  }

  async function deleteQuestion(id: string) {
    const confirmed = await confirmDialog({ title: "Delete question?", message: "This will permanently remove the question.", confirmText: "Delete", variant: "danger" });
    if (!confirmed) return;

    const prev = questions;
    setQuestions((current) => current.filter((q) => q.id !== id));

    try {
      const resp = await fetch(`/api/receptionist/questions/${id}`, {
        method: "DELETE",
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        showMessage(data.error || "Failed to delete question", true);
        setQuestions(prev);
      } else {
        showMessage("Question deleted");
      }
    } catch (err) {
      console.error(err);
      setQuestions(prev);
      showMessage("Failed to delete question", true);
    }
  }

  function reorder(id: string, direction: "up" | "down") {
    const index = sortedQuestions.findIndex((q) => q.id === id);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedQuestions.length) return;

    const newOrder = [...sortedQuestions];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    const updated = newOrder.map((q, idx) => ({ ...q, sort_order: idx }));
    setQuestions(updated);

    fetch("/api/receptionist/questions/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        updated.map((q) => ({
          id: q.id,
          sort_order: q.sort_order,
        }))
      ),
    }).catch((err) => {
      console.error(err);
      showMessage("Failed to reorder questions", true);
      setQuestions(sortedQuestions);
    });
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const resp = await fetch("/api/receptionist/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        showMessage(data.error || "Failed to save settings", true);
      } else {
        if (data.settings?.twilio_phone_number !== undefined) {
          setSettings((prev) => ({
            ...prev,
            twilio_phone_number: data.settings.twilio_phone_number,
          }));
        }
        showMessage("Settings saved");
      }
    } catch (err) {
      console.error(err);
      showMessage("Failed to save settings", true);
    } finally {
      setSavingSettings(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition";

  const secondaryButtonClass =
    "inline-flex items-center gap-1 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] transition hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed";

  const dangerButtonClass =
    "inline-flex items-center gap-1 rounded-[4px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger)] hover:text-[var(--canvas)]";

  const primaryButtonClass =
    "gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90";

  return (
    <div className="space-y-8">
      <section className="card-flat p-6">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="heading-display text-2xl text-[var(--ink)]">Call flow questions</h2>
            <p className="text-sm text-[var(--ink-muted)]">
              Questions are asked in the order shown. The AI receptionist will pause after each question to record the caller&apos;s answer.
            </p>
          </div>
          <Button onClick={createQuestion} disabled={loading} className={primaryButtonClass}>
            <PlusIcon size={16} strokeWidth={1.5} />
            Add question
          </Button>
        </header>

        {error && (
          <div className="mb-4 rounded-[6px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-[6px] border border-[var(--verified)]/30 bg-[var(--verified-soft)] p-3 text-sm text-[var(--verified)]">
            {success}
          </div>
        )}

        {sortedQuestions.length === 0 ? (
          <div className="rounded-[6px] border border-dashed border-[var(--rule-strong)] bg-[var(--canvas-subtle)] p-10 text-center text-sm text-[var(--ink-muted)]">
            No questions yet. Add a question to start building your receptionist call flow.
          </div>
        ) : (
          <div className="space-y-4">
            {sortedQuestions.map((question, idx) => (
              <div
                key={question.id}
                className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] p-5 transition hover:border-[var(--rule-strong)]"
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="label-section text-[var(--ink-subtle)]">Question {idx + 1}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => reorder(question.id, "up")}
                      disabled={idx === 0}
                      className={secondaryButtonClass}
                    >
                      <ArrowUpAZIcon size={14} strokeWidth={1.5} /> Up
                    </button>
                    <button
                      onClick={() => reorder(question.id, "down")}
                      disabled={idx === sortedQuestions.length - 1}
                      className={secondaryButtonClass}
                    >
                      <ArrowDownAZIcon size={14} strokeWidth={1.5} /> Down
                    </button>
                    <button
                      onClick={() => deleteQuestion(question.id)}
                      className={dangerButtonClass}
                    >
                      <TrashIcon size={14} strokeWidth={1.5} /> Delete
                    </button>
                  </div>
                </div>

                <label className="label-section block text-[var(--ink-muted)]">
                  Prompt
                  <textarea
                    value={question.prompt}
                    onChange={(e) => updateQuestion(question.id, { prompt: e.target.value })}
                    className={inputClass}
                    rows={3}
                  />
                </label>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="label-section block text-[var(--ink-muted)]">
                    Expected response type
                    <select
                      value={question.expected_response ?? "open"}
                      onChange={(e) => updateQuestion(question.id, { expected_response: e.target.value })}
                      className={inputClass}
                    >
                      <option value="open">Open response</option>
                      <option value="number">Number (phone, amount, etc.)</option>
                      <option value="email">Email</option>
                      <option value="yes_no">Yes / No</option>
                      <option value="datetime">Date &amp; time</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <div className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-3 py-2 mono text-xs text-[var(--ink-subtle)]">
                      Last updated:{" "}
                      {question.updated_at ? new Date(question.updated_at).toLocaleString() : new Date().toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card-flat p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="heading-display text-2xl text-[var(--ink)]">Greeting &amp; farewell</h2>
            <p className="text-sm text-[var(--ink-muted)]">
              These messages are spoken before the first question and after all questions are complete.
            </p>
          </div>
          <Button
            onClick={saveSettings}
            disabled={savingSettings}
            className={primaryButtonClass}
          >
            <SaveIcon size={16} strokeWidth={1.5} />
            {savingSettings ? "Saving…" : "Save messages"}
          </Button>
        </div>

        <div className="grid gap-6">
          <label className="label-section block text-[var(--ink-muted)]">
            Twilio phone number
            <input
              type="tel"
              placeholder="+15551234567"
              value={settings.twilio_phone_number ?? ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  twilio_phone_number: e.target.value,
                }))
              }
              className={inputClass}
            />
            <span className="mt-1.5 block text-[11px] text-[var(--ink-subtle)] normal-case tracking-normal">
              Enter the exact Twilio number (E.164 format) you pointed at this webhook. Example: +15551234567
            </span>
          </label>

          <label className="label-section block text-[var(--ink-muted)]">
            Greeting (played when the call is answered)
            <textarea
              value={settings.greeting}
              onChange={(e) => setSettings((prev) => ({ ...prev, greeting: e.target.value }))}
              className={inputClass}
              rows={3}
            />
          </label>

          <label className="label-section block text-[var(--ink-muted)]">
            Farewell (played after the final question and AI response)
            <textarea
              value={settings.farewell}
              onChange={(e) => setSettings((prev) => ({ ...prev, farewell: e.target.value }))}
              className={inputClass}
              rows={3}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
