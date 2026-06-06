"use client";

// Settings → Phone numbers panel.
//
// Two modes:
//  • Not connected: show the credential form. Once saved, the view
//    flips to the connected state in the same render cycle.
//  • Connected: show the Twilio account friendly name, each phone
//    number on the account, which agent (if any) currently owns it,
//    and the webhook URLs the user needs to paste into the Twilio
//    console for that number to actually route to Drift.
//
// We intentionally don't auto-provision webhook URLs on the user's
// Twilio numbers. Twilio's Messaging Services + number configuration
// can be set up in ways we'd blow away (e.g. a user's existing
// recording flow), so we surface the URLs and let them paste. If
// self-service auto-config becomes a real ask we'll add a "Configure
// automatically" button that writes via the Twilio API.

import { useCallback, useEffect, useState } from "react";
import {
  Phone,
  Link2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  RefreshCw,
  ExternalLink,
  UserRound,
  ChevronDown,
  ChevronRight,
  Forward,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm-dialog";

interface AgentRef {
  id: string;
  name: string;
  status: string | null;
  isSpecialist: boolean | null;
  phoneNumber: string | null;
  humanFallbackNumber: string | null;
}

interface NumberRow {
  sid: string;
  phoneNumber: string;
  friendlyName: string | null;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  voiceUrl: string | null;
  smsUrl: string | null;
  webhookReady: boolean;
  attachedAgent: { id: string; name: string } | null;
}

interface NumbersResponse {
  connected: boolean;
  friendlyName: string | null;
  numbers: NumberRow[];
  agents: AgentRef[];
  webhookUrls: {
    voice: string;
    sms: string;
    statusCallback: string;
  };
  error?: string;
}

export default function PhoneNumbersCard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NumbersResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/twilio/numbers", {
        credentials: "include",
      });
      const json: NumbersResponse = await res.json();
      if (!res.ok) {
        throw new Error((json as any)?.error || "Failed to load.");
      }
      setData(json);
    } catch (err: any) {
      setFetchError(err?.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="card-flat p-6 flex items-center justify-center text-sm text-[var(--ink-muted)]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" strokeWidth={1.5} />
        Loading phone configuration…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="card-flat p-6">
        <div className="flex items-center gap-2 text-sm text-[#ef4444]">
          <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
          {fetchError}
        </div>
        <button
          onClick={fetchData}
          className="mt-3 text-sm text-[var(--accent)] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return data.connected ? (
    <ConnectedView data={data} onChange={fetchData} />
  ) : (
    <ConnectForm webhookUrls={data.webhookUrls} onConnected={fetchData} />
  );
}

// ──────────────────────────────────────────────────────────────
// Connect form — first-run state.
// ──────────────────────────────────────────────────────────────

function ConnectForm({
  webhookUrls,
  onConnected,
}: {
  webhookUrls: NumbersResponse["webhookUrls"];
  onConnected: () => void;
}) {
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/twilio/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          account_sid: sid.trim(),
          auth_token: token.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Couldn't verify those credentials.");
      }
      toast.success(
        json.friendly_name
          ? `Connected to Twilio (${json.friendly_name}).`
          : "Twilio connected.",
      );
      onConnected();
    } catch (err: any) {
      setError(err?.message || "Couldn't verify those credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-flat p-6">
        <div className="label-section mb-2">Step 1</div>
        <h3 className="heading-display text-xl text-[var(--ink)] mb-2">
          Connect your Twilio account
        </h3>
        <p className="text-sm text-[var(--ink-muted)] mb-5">
          Drift uses your own Twilio account to answer calls, so you own the
          numbers and the bill. Find your Account SID and Auth Token in the{" "}
          <a
            href="https://console.twilio.com"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            Twilio Console
            <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          </a>{" "}
          on the main dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--ink-muted)]">
              Account SID
            </label>
            <input
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              placeholder="AC••••••••••••••••••••••••••••••••"
              className="mt-1 w-full px-3 py-2 text-sm bg-[var(--neu-input)] border border-white/30 border-t-white/50 rounded-[4px] text-[var(--ink)] outline-none focus:border-[var(--accent)] shadow-[var(--neu-shadow-pressed)] font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--ink-muted)]">
              Auth Token
            </label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="••••••••••••••••••••••••••••••••"
              className="mt-1 w-full px-3 py-2 text-sm bg-[var(--neu-input)] border border-white/30 border-t-white/50 rounded-[4px] text-[var(--ink)] outline-none focus:border-[var(--accent)] shadow-[var(--neu-shadow-pressed)] font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-[var(--ink-subtle)] mt-1">
              Stored in your workspace only. You can revoke it from the Twilio
              console at any time.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-[#ef4444]">
              <AlertCircle
                className="w-4 h-4 mt-0.5 shrink-0"
                strokeWidth={1.5}
              />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !sid.trim() || !token.trim()}
            className="inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 rounded-[4px] text-sm font-medium hover:bg-[var(--ink)]/90 transition disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Link2 className="w-4 h-4" strokeWidth={1.5} />
            )}
            {submitting ? "Verifying…" : "Verify & connect"}
          </button>
        </form>
      </div>

      <div className="card-flat p-6">
        <div className="label-section mb-2">Step 2 · preview</div>
        <h3 className="heading-display text-xl text-[var(--ink)] mb-2">
          Point your numbers at Drift
        </h3>
        <p className="text-sm text-[var(--ink-muted)] mb-5">
          After you connect, each Twilio number on your account needs these
          webhook URLs pasted into its configuration page in Twilio.
        </p>
        <WebhookList urls={webhookUrls} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Connected view — list of numbers + management.
// ──────────────────────────────────────────────────────────────

function ConnectedView({
  data,
  onChange,
}: {
  data: NumbersResponse;
  onChange: () => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleDisconnect() {
    const ok = await confirmDialog({
      title: "Disconnect Twilio?",
      message:
        "Drift will stop answering calls on every number on this account until you reconnect. Agent-number assignments are preserved.",
      confirmText: "Disconnect",
      variant: "danger",
    });
    if (!ok) return;

    setDisconnecting(true);
    try {
      const res = await fetch("/api/twilio/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Disconnect failed.");
      toast.success("Twilio disconnected.");
      onChange();
    } catch (err: any) {
      toast.error(err?.message || "Disconnect failed.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onChange();
    } finally {
      setRefreshing(false);
    }
  }

  const assignableAgents = data.agents.filter(
    (a) => !a.isSpecialist && a.status !== "archived",
  );

  return (
    <div className="space-y-4">
      {data.error && (
        <div className="card-flat p-4 flex items-start gap-2 text-sm text-[#ef4444]">
          <AlertCircle
            className="w-4 h-4 mt-0.5 shrink-0"
            strokeWidth={1.5}
          />
          <span>{data.error}</span>
        </div>
      )}

      <div className="card-flat p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2
                className="w-4 h-4 text-[#10b981]"
                strokeWidth={1.5}
              />
              <span className="label-section text-[var(--ink-muted)]">
                Connected
              </span>
            </div>
            <h3 className="heading-display text-xl text-[var(--ink)]">
              {data.friendlyName || "Twilio account"}
            </h3>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              {data.numbers.length}{" "}
              {data.numbers.length === 1 ? "number" : "numbers"} on this
              account.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={1.5}
              />
              Refresh
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-sm text-[#ef4444] hover:underline disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      </div>

      <div className="card-flat p-6">
        <div className="label-section mb-2">Webhook URLs</div>
        <h3 className="heading-display text-xl text-[var(--ink)] mb-2">
          Paste these into each number
        </h3>
        <p className="text-sm text-[var(--ink-muted)] mb-4">
          In the Twilio Console, open each number below and set these fields
          under <em>Voice Configuration</em> and <em>Messaging Configuration</em>.
        </p>
        <WebhookList urls={data.webhookUrls} />
      </div>

      <div className="card-flat p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label-section mb-1">Numbers</div>
            <h3 className="heading-display text-xl text-[var(--ink)]">
              Assign numbers to agents
            </h3>
          </div>
        </div>

        {data.numbers.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-[var(--rule)] p-8 text-center">
            <Phone
              className="w-6 h-6 text-[var(--ink-subtle)] mx-auto mb-2"
              strokeWidth={1.5}
            />
            <div className="text-sm text-[var(--ink-muted)]">
              No phone numbers on this Twilio account yet.
            </div>
            <a
              href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
            >
              Buy a number in Twilio
              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
            </a>
          </div>
        ) : (
          <div className="divide-y divide-[var(--rule)]">
            {data.numbers.map((n) => (
              <NumberRowItem
                key={n.sid}
                number={n}
                agents={assignableAgents}
                allAgents={data.agents}
                onChange={onChange}
              />
            ))}
          </div>
        )}

        {assignableAgents.length === 0 && data.numbers.length > 0 && (
          <div className="mt-4 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-3 text-xs text-[var(--ink-muted)]">
            You don't have any non-specialist agents yet. Create one from{" "}
            <a href="/agents" className="text-[var(--accent)] hover:underline">
              Agents
            </a>{" "}
            before assigning a number.
          </div>
        )}
      </div>

      <RecordingDisclosureCard />

      <ForwardingGuide />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Call-recording disclosure editor.
//
// Drift stores a transcript of every voice call; the disclosure is
// spoken at the very start of the call so the caller has knowledge
// of the capture before they say anything. Two-party-consent states
// (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA, CT) require this, and
// brokerage compliance desks typically have
// approved wording they prefer. We default to a safe generic line
// and let workspaces override.
// ──────────────────────────────────────────────────────────────

function RecordingDisclosureCard() {
  const [loaded, setLoaded] = useState(false);
  const [defaultText, setDefaultText] = useState("");
  const [draft, setDraft] = useState("");
  // `stored` is what's currently in the DB (null means "using default").
  // `draft` is what's in the textarea right now.
  const [stored, setStored] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspaces/recording-disclosure", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setDefaultText(json.default || "");
        setStored(json.disclosure ?? null);
        setDraft(json.disclosure ?? "");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const usingDefault = stored === null;
  const trimmed = draft.trim();
  const dirty = (stored ?? "") !== trimmed;

  async function save(value: string | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/recording-disclosure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disclosure: value }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Couldn't save disclosure.");
        return;
      }
      setStored(json.disclosure ?? null);
      setDraft(json.disclosure ?? "");
      toast.success(
        json.disclosure === null
          ? "Reverted to the default disclosure."
          : "Disclosure updated.",
      );
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save disclosure.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-flat p-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 text-left"
      >
        <ShieldCheck
          className="w-4 h-4 text-[var(--ink-muted)] mt-1 shrink-0"
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <div className="label-section mb-1">Compliance</div>
          <h3 className="heading-display text-xl text-[var(--ink)]">
            Call recording disclosure
          </h3>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Spoken at the very start of every voice call so callers know the
            conversation is transcribed. Required for two-party-consent
            states.
          </p>
        </div>
        {open ? (
          <ChevronDown
            className="w-4 h-4 text-[var(--ink-subtle)] mt-1.5"
            strokeWidth={1.5}
          />
        ) : (
          <ChevronRight
            className="w-4 h-4 text-[var(--ink-subtle)] mt-1.5"
            strokeWidth={1.5}
          />
        )}
      </button>

      {open && (
        <div className="mt-4 pl-7 space-y-3">
          <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-3 text-xs text-[var(--ink-muted)]">
            <span className="text-[var(--ink-subtle)]">Default:</span>{" "}
            <span className="text-[var(--ink-muted)]">
              {loaded ? defaultText : "Loading…"}
            </span>
          </div>

          <div>
            <label
              htmlFor="recording-disclosure"
              className="block text-xs font-medium text-[var(--ink-muted)] mb-1"
            >
              Custom wording{" "}
              <span className="text-[var(--ink-subtle)] font-normal">
                (leave empty to use the default)
              </span>
            </label>
            <textarea
              id="recording-disclosure"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder={defaultText}
              disabled={!loaded || saving}
              className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <div className="flex items-center justify-between mt-1 text-xs text-[var(--ink-subtle)]">
              <span>{draft.length}/600</span>
              <span>
                {usingDefault
                  ? "Currently using the default."
                  : "Custom wording is active."}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => save(trimmed.length === 0 ? null : trimmed)}
              disabled={!loaded || saving || !dirty}
              className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Save
            </button>
            {!usingDefault && (
              <button
                onClick={() => save(null)}
                disabled={!loaded || saving}
                className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Revert to default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// "Use your existing business number" — plain-language explainer
// for the common case where a customer already has a line (Verizon,
// AT&T, RingCentral, whatever) and doesn't want to switch numbers.
// Call forwarding is the easy button: Twilio number answers, Drift
// picks up, caller sees/uses their existing business number.
// ──────────────────────────────────────────────────────────────

function ForwardingGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-flat p-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 text-left"
      >
        <Forward
          className="w-4 h-4 text-[var(--ink-muted)] mt-1 shrink-0"
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <div className="label-section mb-1">Keeping your existing number</div>
          <h3 className="heading-display text-xl text-[var(--ink)]">
            Already have a business line?
          </h3>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            You don't have to move it. Buy a Twilio number, set your existing
            line to forward to it, and Drift answers every call.
          </p>
        </div>
        {open ? (
          <ChevronDown
            className="w-4 h-4 text-[var(--ink-subtle)] mt-1.5"
            strokeWidth={1.5}
          />
        ) : (
          <ChevronRight
            className="w-4 h-4 text-[var(--ink-subtle)] mt-1.5"
            strokeWidth={1.5}
          />
        )}
      </button>

      {open && (
        <div className="mt-5 pt-5 border-t border-[var(--rule)] space-y-4 text-sm text-[var(--ink)]">
          <div>
            <div className="font-medium mb-1">The three steps</div>
            <ol className="list-decimal ml-5 space-y-1.5 text-[var(--ink-muted)]">
              <li>
                Buy a Twilio number in the{" "}
                <a
                  href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  Twilio Console
                </a>
                . Any number works — it's just a destination for forwarded
                calls. Your customers never see it.
              </li>
              <li>
                Assign it to an agent above and paste the webhook URLs into
                Twilio.
              </li>
              <li>
                Set your existing business line to forward incoming calls to
                the Twilio number (instructions below per carrier).
              </li>
            </ol>
          </div>

          <CarrierSteps
            name="Google Voice"
            steps={[
              "Open voice.google.com → Settings → Calls.",
              "Toggle on Forwarding and add your Twilio number.",
            ]}
          />
          <CarrierSteps
            name="RingCentral"
            steps={[
              "Admin Portal → Users → pick the line → Phones & Numbers.",
              "Call Forwarding → Add destination → paste your Twilio number.",
              "Set rules: Always or Only when unanswered, as you prefer.",
            ]}
          />
          <CarrierSteps
            name="OpenPhone"
            steps={[
              "Settings → pick the number → Call forwarding.",
              "Add a forwarding destination with your Twilio number.",
            ]}
          />
          <CarrierSteps
            name="Verizon / AT&T / T-Mobile landline or mobile"
            steps={[
              "On the line's handset, dial *72 followed by your Twilio number (e.g. *72 5551234567).",
              "Wait for two short beeps, then hang up. Forwarding is on.",
              "To turn it off later, dial *73.",
            ]}
          />
          <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-3 text-xs text-[var(--ink-muted)]">
            Not sure? Search your carrier's help docs for "conditional call
            forwarding" or "busy/no-answer forwarding" — most business phone
            systems support it under one of those names.
          </div>
        </div>
      )}
    </div>
  );
}

function CarrierSteps({ name, steps }: { name: string; steps: string[] }) {
  return (
    <div>
      <div className="font-medium text-[var(--ink)]">{name}</div>
      <ol className="list-decimal ml-5 space-y-0.5 text-[var(--ink-muted)] text-xs mt-1">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function NumberRowItem({
  number,
  agents,
  allAgents,
  onChange,
}: {
  number: NumberRow;
  agents: AgentRef[];
  allAgents: AgentRef[];
  onChange: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const currentAgentId = number.attachedAgent?.id ?? "";

  // Look up the full agent record (with humanFallbackNumber) from the
  // workspace-wide agent list so the child fallback form can preload
  // the currently-saved value.
  const attachedAgentFull = number.attachedAgent
    ? allAgents.find((a) => a.id === number.attachedAgent!.id) || null
    : null;

  async function handleAssign(agentId: string) {
    setSaving(true);
    try {
      // If user is choosing a new agent, we send phone_number to that
      // agent. If clearing, we detach the currently attached agent.
      if (agentId === "") {
        if (!number.attachedAgent) {
          setSaving(false);
          return;
        }
        const res = await fetch("/api/twilio/attach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            agent_id: number.attachedAgent.id,
            phone_number: null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to detach.");
        toast.success("Number unassigned.");
      } else {
        const res = await fetch("/api/twilio/attach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            agent_id: agentId,
            phone_number: number.phoneNumber,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to assign.");
        toast.success("Number assigned.");
      }
      onChange();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Phone
              className="w-3.5 h-3.5 text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
            <span className="text-sm font-medium text-[var(--ink)] font-mono">
              {number.phoneNumber}
            </span>
            {number.friendlyName &&
              number.friendlyName !== number.phoneNumber && (
                <span className="text-xs text-[var(--ink-muted)] truncate">
                  · {number.friendlyName}
                </span>
              )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--ink-muted)]">
            <CapabilityPills caps={number.capabilities} />
            {number.webhookReady ? (
              <span className="inline-flex items-center gap-1 text-[#10b981]">
                <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                Webhooks set
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#f59e0b]">
                <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
                Webhooks not set
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <select
            value={currentAgentId}
            onChange={(e) => handleAssign(e.target.value)}
            disabled={saving || agents.length === 0}
            className="px-3 py-1.5 text-sm bg-[var(--neu-input)] border border-white/30 border-t-white/50 rounded-[4px] text-[var(--ink)] outline-none focus:border-[var(--accent)] shadow-[var(--neu-shadow-pressed)] disabled:opacity-50 min-w-[180px]"
          >
            <option value="">Unassigned</option>
            {/* Include the currently-attached agent even if they're
                archived or specialist — otherwise the dropdown can't
                represent the actual state. */}
            {number.attachedAgent &&
              !agents.some((a) => a.id === number.attachedAgent!.id) && (
                <option value={number.attachedAgent.id}>
                  {number.attachedAgent.name}
                </option>
              )}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Per-agent human-fallback config. Only surfaces once a number
          is actually attached to an agent — no agent means no place
          to hang the fallback number. */}
      {attachedAgentFull && (
        <HumanFallbackForm
          key={attachedAgentFull.id}
          agent={attachedAgentFull}
          onSaved={onChange}
        />
      )}
    </div>
  );
}

function HumanFallbackForm({
  agent,
  onSaved,
}: {
  agent: AgentRef;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(!!agent.humanFallbackNumber);
  const [value, setValue] = useState(agent.humanFallbackNumber || "");
  const [saving, setSaving] = useState(false);
  const dirty = (agent.humanFallbackNumber || "") !== value.trim();
  const hasNumber = !!agent.humanFallbackNumber;

  async function save(phone: string | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/agents/fallback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agent_id: agent.id, phone_number: phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save.");
      toast.success(
        phone === null ? "Fallback removed." : "Fallback saved.",
      );
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 ml-5 pl-4 border-l-2 border-[var(--rule)]">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        )}
        <UserRound className="w-3 h-3" strokeWidth={1.5} />
        <span>
          Transfer to a human
          {hasNumber && (
            <span className="ml-2 font-mono text-[var(--ink)]">
              → {agent.humanFallbackNumber}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
            When the caller asks for a real person ("talk to someone,"
            "representative," etc.), Drift bridges the call here. Leave blank
            to have Drift keep trying to help.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="tel"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="+1 555 123 4567"
              className="flex-1 px-3 py-1.5 text-sm bg-[var(--neu-input)] border border-white/30 border-t-white/50 rounded-[4px] text-[var(--ink)] outline-none focus:border-[var(--accent)] shadow-[var(--neu-shadow-pressed)] font-mono"
            />
            <button
              onClick={() => save(value.trim() || null)}
              disabled={saving || !dirty}
              className="px-3 py-1.5 text-xs font-medium bg-[var(--ink)] text-[var(--canvas)] rounded-[4px] hover:bg-[var(--ink)]/90 transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {hasNumber && (
              <button
                onClick={() => {
                  setValue("");
                  save(null);
                }}
                disabled={saving}
                className="text-xs text-[#ef4444] hover:underline disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CapabilityPills({
  caps,
}: {
  caps: { voice: boolean; sms: boolean; mms: boolean };
}) {
  const labels: string[] = [];
  if (caps.voice) labels.push("Voice");
  if (caps.sms) labels.push("SMS");
  if (caps.mms) labels.push("MMS");
  if (labels.length === 0) return null;
  return <span>{labels.join(" · ")}</span>;
}

function WebhookList({
  urls,
}: {
  urls: { voice: string; sms: string; statusCallback: string };
}) {
  return (
    <div className="space-y-2">
      <WebhookRow label="A call comes in" value={urls.voice} method="HTTP POST" />
      <WebhookRow
        label="A message comes in"
        value={urls.sms}
        method="HTTP POST"
      />
      <WebhookRow
        label="Call status changes"
        value={urls.statusCallback}
        method="HTTP POST"
        optional
      />
    </div>
  );
}

function WebhookRow({
  label,
  value,
  method,
  optional,
}: {
  label: string;
  value: string;
  method: string;
  optional?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  }

  return (
    <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-[var(--ink-muted)] flex items-center gap-2">
            {label}
            {optional && (
              <span className="text-[var(--ink-subtle)]">(optional)</span>
            )}
            <span className="text-[var(--ink-subtle)]">· {method}</span>
          </div>
          <div className="text-sm font-mono text-[var(--ink)] truncate">
            {value}
          </div>
        </div>
        <button
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
        >
          {copied ? (
            <>
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" strokeWidth={1.5} />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}
