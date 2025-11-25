"use client";

import { useMemo, useState } from "react";
import { PlusIcon, ArrowUpAZIcon, ArrowDownAZIcon, TrashIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function QuestionManager({ workspaceId, initialQuestions, initialSettings }: Props) {
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
    const confirmed = confirm("Delete this question?");
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

  return (
    <div className="space-y-12">
      <section className="rounded-3xl border border-white/10 bg-black/40 p-8 shadow-xl">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Call Flow Questions</h2>
            <p className="text-sm text-white/60">
              Questions are asked in the order shown. The AI receptionist will pause after each question to record the caller’s answer.
            </p>
          </div>
          <Button onClick={createQuestion} disabled={loading} className="gap-2 bg-[#3351ff] hover:bg-[#4a64ff]">
            <PlusIcon size={16} />
            Add Question
          </Button>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-100">{success}</div>
        )}

        {sortedQuestions.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center text-sm text-white/60">
            No questions yet. Add a question to start building your receptionist call flow.
          </div>
        ) : (
          <div className="space-y-4">
            {sortedQuestions.map((question, idx) => (
              <div
                key={question.id}
                className="rounded-2xl border border-white/10 bg-black/25 p-6 shadow-inner shadow-black/40 transition hover:border-[#3351ff]/40"
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs uppercase tracking-[0.35em] text-white/40">Question {idx + 1}</span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      onClick={() => reorder(question.id, "up")}
                      disabled={idx === 0}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/70 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-30"
                    >
                      <ArrowUpAZIcon size={14} /> Up
                    </button>
                    <button
                      onClick={() => reorder(question.id, "down")}
                      disabled={idx === sortedQuestions.length - 1}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/70 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-30"
                    >
                      <ArrowDownAZIcon size={14} /> Down
                    </button>
                    <button
                      onClick={() => deleteQuestion(question.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-200 transition hover:border-red-400/60 hover:bg-red-500/20"
                    >
                      <TrashIcon size={14} /> Delete
                    </button>
                  </div>
                </div>

                <label className="block text-xs font-semibold uppercase tracking-wide text-white/50">
                  Prompt
                  <textarea
                    value={question.prompt}
                    onChange={(e) => updateQuestion(question.id, { prompt: e.target.value })}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white shadow-inner shadow-black/40 focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/30"
                    rows={3}
                  />
                </label>

                <div className="mt-4 grid gap-4 text-sm text-white/70 sm:grid-cols-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-white/50">
                    Expected Response Type
                    <select
                      value={question.expected_response ?? "open"}
                      onChange={(e) => updateQuestion(question.id, { expected_response: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/30"
                    >
                      <option value="open">Open response</option>
                      <option value="number">Number (phone, amount, etc.)</option>
                      <option value="email">Email</option>
                      <option value="yes_no">Yes / No</option>
                      <option value="datetime">Date & Time</option>
                    </select>
                  </label>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/50">
                    Last updated:{" "}
                    {question.updated_at ? new Date(question.updated_at).toLocaleString() : new Date().toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/40 p-8 shadow-xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Greeting & Farewell</h2>
            <p className="text-sm text-white/60">
              These messages are spoken before the first question and after all questions are complete.
            </p>
          </div>
          <Button
            onClick={saveSettings}
            disabled={savingSettings}
            className="gap-2 bg-[#3351ff] hover:bg-[#4a64ff]"
          >
            <SaveIcon size={16} />
            {savingSettings ? "Saving…" : "Save Messages"}
          </Button>
        </div>

        <div className="grid gap-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-white/50">
            Twilio Phone Number
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
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/30"
            />
            <span className="mt-1 block text-[11px] text-white/40">
              Enter the exact Twilio number (E.164 format) you pointed at this webhook. Example: +15551234567
            </span>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-white/50">
            Greeting (played when the call is answered)
            <textarea
              value={settings.greeting}
              onChange={(e) => setSettings((prev) => ({ ...prev, greeting: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/30"
              rows={3}
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-white/50">
            Farewell (played after the final question and AI response)
            <textarea
              value={settings.farewell}
              onChange={(e) => setSettings((prev) => ({ ...prev, farewell: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/30"
              rows={3}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

