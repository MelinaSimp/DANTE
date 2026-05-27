"use client";

import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface ProfileData {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  notification_email: string | null;
}

export default function AccountCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    fetch("/api/profile", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        const p: ProfileData = data.profile;
        setAuthEmail(data.authEmail ?? null);
        setEmail(p.notification_email ?? "");
        setName(p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" "));
      })
      .catch(reportError("AccountCard: load"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          notification_email: email.trim(),
          full_name: name.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      reportError("AccountCard: save")(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Name */}
      <div>
        <label className="block label-section text-[var(--ink-muted)] mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
          className="w-full max-w-md px-3 py-2 rounded-[4px] border border-[var(--rule-strong)] bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--ink)] focus:outline-none"
        />
      </div>

      {/* Email */}
      <div>
        <label className="block label-section text-[var(--ink-muted)] mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={authEmail ?? "you@company.com"}
          className="w-full max-w-md px-3 py-2 rounded-[4px] border border-[var(--rule-strong)] bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--ink)] focus:outline-none"
        />
        <p className="text-[11px] text-[var(--ink-subtle)] mt-1.5">
          Used for appointment reminders and notifications when a contact has no email on file.
          {authEmail && !email ? ` Falls back to your sign-in email (${authEmail}).` : ""}
        </p>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
        ) : saved ? (
          <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
        ) : null}
        {saving ? "Saving..." : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
