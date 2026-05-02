"use client";

// SMS settings client.
//
// Three states:
//   1. No phone connected → show phone-input form
//   2. Phone entered, code sent → show code-input form
//   3. Verified → show prefs (briefing toggle, quiet hours, timezone) + disconnect button

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Phone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Bell,
  X,
  ShieldCheck,
} from "lucide-react";

interface Prefs {
  sms_phone: string | null;
  sms_verified_at: string | null;
  sms_briefing_enabled: boolean;
  sms_quiet_start: string | null;
  sms_quiet_end: string | null;
  sms_timezone: string;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default function SmsSettingsClient() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/sms/prefs", { credentials: "include" });
    const j = await r.json().catch(() => ({}));
    setPrefs((j.prefs as Prefs) || {
      sms_phone: null,
      sms_verified_at: null,
      sms_briefing_enabled: false,
      sms_quiet_start: null,
      sms_quiet_end: null,
      sms_timezone: "America/New_York",
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sendCode = async () => {
    setWorking(true);
    setMsg(null);
    try {
      const r = await fetch("/api/sms/verify/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ kind: "error", text: j?.error || "Failed" });
        return;
      }
      setPendingPhone(j.phone);
      setMsg({
        kind: "ok",
        text: `Code texted to ${j.phone}. Enter it below within 10 minutes.`,
      });
    } finally {
      setWorking(false);
    }
  };

  const confirmCode = async () => {
    setWorking(true);
    setMsg(null);
    try {
      const r = await fetch("/api/sms/verify/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ kind: "error", text: j?.error || "Failed" });
        return;
      }
      setMsg({ kind: "ok", text: `Verified ${j.phone}. You're connected.` });
      setPendingPhone(null);
      setCodeInput("");
      setPhoneInput("");
      await load();
    } finally {
      setWorking(false);
    }
  };

  const updatePrefs = async (patch: Partial<Prefs>) => {
    setWorking(true);
    setMsg(null);
    try {
      const r = await fetch("/api/sms/prefs", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ kind: "error", text: j?.error || "Failed" });
        return;
      }
      setPrefs(j.prefs as Prefs);
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect SMS? You'll need to re-verify to text the assistant again.")) return;
    setWorking(true);
    try {
      await fetch("/api/sms/prefs", {
        method: "DELETE",
        credentials: "include",
      });
      await load();
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
      </div>
    );
  }

  const verified = !!prefs?.sms_verified_at;

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <div className="label-section mb-1">Settings</div>
          <h1 className="heading-display text-3xl">SMS &amp; iMessage</h1>
          <p className="prose-body text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Text Drift from your phone — Dante (or Vergil) responds via SMS or
            iMessage with the same memory, citations, and audit trail as the
            web app. Send <span className="mono">/help</span> for the command
            list once you're connected.
          </p>
        </div>

        {msg && (
          <div
            className="text-xs px-3 py-2 rounded-[4px] flex items-center gap-2"
            style={{
              color: msg.kind === "ok" ? "var(--verified)" : "var(--danger)",
              border: `1px solid ${msg.kind === "ok" ? "var(--verified)" : "var(--danger)"}`,
              background: "var(--canvas-subtle)",
            }}
          >
            {msg.kind === "ok" ? (
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
            {msg.text}
            <button
              onClick={() => setMsg(null)}
              className="ml-auto opacity-50 hover:opacity-100"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Connected state */}
        {verified && prefs?.sms_phone && (
          <section className="card-flat p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--verified)]" strokeWidth={1.5} />
              <span className="text-sm font-semibold">Connected</span>
              <span className="text-xs mono text-[var(--ink-muted)]">{prefs.sms_phone}</span>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">
              Text the Drift number from {prefs.sms_phone}. Replies arrive on
              the same number.
            </p>

            <div className="border-t border-[var(--rule)] pt-4 space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={prefs.sms_briefing_enabled}
                  onChange={(e) =>
                    updatePrefs({ sms_briefing_enabled: e.target.checked })
                  }
                  disabled={working}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                    Daily morning briefing
                  </div>
                  <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                    A 3-line text at 8am ET — the day's most time-sensitive item,
                    a client to touch, and any reminders you've set.
                  </p>
                </div>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <label className="block">
                  <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" strokeWidth={1.5} />
                    Quiet hours start
                  </div>
                  <input
                    type="time"
                    value={prefs.sms_quiet_start || ""}
                    onChange={(e) =>
                      updatePrefs({ sms_quiet_start: e.target.value || null })
                    }
                    disabled={working}
                    className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
                  />
                </label>
                <label className="block">
                  <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" strokeWidth={1.5} />
                    Quiet hours end
                  </div>
                  <input
                    type="time"
                    value={prefs.sms_quiet_end || ""}
                    onChange={(e) =>
                      updatePrefs({ sms_quiet_end: e.target.value || null })
                    }
                    disabled={working}
                    className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
                  />
                </label>
              </div>
              <p className="text-[10px] text-[var(--ink-subtle)]">
                During quiet hours we'll save inbound texts but won't reply
                until the window ends. Use <span className="mono">/loud</span>{" "}
                to override anytime.
              </p>

              <label className="block mt-3">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Timezone
                </div>
                <select
                  value={prefs.sms_timezone}
                  onChange={(e) =>
                    updatePrefs({ sms_timezone: e.target.value })
                  }
                  disabled={working}
                  className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="border-t border-[var(--rule)] pt-4">
              <button
                onClick={disconnect}
                disabled={working}
                className="text-xs px-3 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
              >
                Disconnect SMS
              </button>
            </div>
          </section>
        )}

        {/* Connect flow */}
        {!verified && (
          <section className="card-flat p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
              <h2 className="text-base font-semibold">Connect your phone</h2>
            </div>

            {!pendingPhone ? (
              <div className="space-y-3">
                <label className="block">
                  <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                    Phone number
                  </div>
                  <input
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+1 555 123 4567"
                    className="w-full text-sm px-3 py-2 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
                  />
                </label>
                <button
                  onClick={sendCode}
                  disabled={!phoneInput || working}
                  className="text-xs inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
                >
                  {working ? (
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                  ) : null}
                  Text me a code
                </button>
                <p className="text-[10px] text-[var(--ink-subtle)]">
                  We'll send a 6-digit code to verify the number is yours.
                  Standard messaging rates apply.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[var(--ink)]">
                  Code sent to{" "}
                  <span className="mono font-medium">{pendingPhone}</span>.
                  Enter the 6 digits below.
                </p>
                <input
                  value={codeInput}
                  onChange={(e) =>
                    setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  className="w-32 text-2xl mono tracking-widest text-center px-3 py-2 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={confirmCode}
                    disabled={codeInput.length !== 6 || working}
                    className="text-xs inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
                  >
                    {working ? (
                      <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                    ) : null}
                    Verify
                  </button>
                  <button
                    onClick={() => {
                      setPendingPhone(null);
                      setCodeInput("");
                    }}
                    className="text-xs px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)]"
                  >
                    Use a different number
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="card-flat p-6">
          <div className="label-section mb-3">Slash commands</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {[
              ["/help", "List commands"],
              ["/digest", "Send the briefing now"],
              ["/quiet 4", "Mute for 4 hours (1–72)"],
              ["/loud", "Un-mute"],
              ["/forget last", "Drop the most recent memory write"],
              ["/status", "Quick state check"],
            ].map(([cmd, desc]) => (
              <div
                key={cmd}
                className="flex items-baseline gap-2 px-2 py-1.5 border border-[var(--rule)] rounded-[4px]"
              >
                <span className="mono text-[var(--ink)] font-semibold">{cmd}</span>
                <span className="text-[var(--ink-muted)]">— {desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
