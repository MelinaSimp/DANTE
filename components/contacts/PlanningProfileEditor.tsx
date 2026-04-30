"use client";

// Compact planning-profile editor for the client detail view.
// Edits the four planning-relevant fields directly on contacts:
//   - date_of_birth        (powers RMD)
//   - spouse_date_of_birth (powers Joint Lifetime RMD divisor)
//   - state_code           (powers Roth state-tax layering)
//   - is_planning_subject  (excludes household admins from analyzers)
//
// Uses the existing PUT /api/contacts/[id] endpoint with the new
// optional planning fields.

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Calendar } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY",
];

interface ContactPlanningFields {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
  date_of_birth: string | null;
  spouse_date_of_birth: string | null;
  state_code: string | null;
  is_planning_subject: boolean | null;
}

export default function PlanningProfileEditor({
  contactId,
}: {
  contactId: string;
}) {
  const [contact, setContact] = useState<ContactPlanningFields | null>(null);
  const [dob, setDob] = useState("");
  const [spouseDob, setSpouseDob] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [planningSubject, setPlanningSubject] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/contacts?id=${contactId}`, {
        credentials: "include",
      }).catch(() => null);
      // Many of the listing endpoints return arrays; fall back to
      // pulling our own contact row.
      let data: ContactPlanningFields | null = null;
      if (r && r.ok) {
        const j = await r.json().catch(() => null);
        if (Array.isArray(j)) {
          data =
            j.find((c: any) => c.id === contactId) || null;
        } else if (j && typeof j === "object") {
          data = j as ContactPlanningFields;
        }
      }
      if (cancelled) return;
      if (!data) return;
      setContact(data);
      setDob(data.date_of_birth || "");
      setSpouseDob(data.spouse_date_of_birth || "");
      setStateCode(data.state_code || "");
      setPlanningSubject(data.is_planning_subject !== false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const dirty =
    contact !== null &&
    (dob !== (contact.date_of_birth || "") ||
      spouseDob !== (contact.spouse_date_of_birth || "") ||
      stateCode !== (contact.state_code || "") ||
      planningSubject !== (contact.is_planning_subject !== false));

  const save = async () => {
    if (!contact) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/contacts/${contactId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contact.name || "",
          email: contact.email || "",
          phone: contact.phone,
          date_of_birth: dob || null,
          spouse_date_of_birth: spouseDob || null,
          state_code: stateCode || null,
          is_planning_subject: planningSubject,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || "Save failed");
        return;
      }
      setContact({
        ...contact,
        date_of_birth: dob || null,
        spouse_date_of_birth: spouseDob || null,
        state_code: stateCode || null,
        is_planning_subject: planningSubject,
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  if (!contact) return null;

  const inputClass =
    "rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  return (
    <section className="card-flat p-6">
      <div className="flex items-center gap-2 mb-1">
        <Calendar
          className="w-3.5 h-3.5 text-[var(--ink-muted)]"
          strokeWidth={1.5}
        />
        <span className="label-section">Planning profile</span>
      </div>
      <p className="text-xs text-[var(--ink-muted)] mb-4 leading-relaxed">
        Powers Roth, RMD, and beneficiary analyzers. DOB drives RMD age,
        spouse DOB switches to the Joint Lifetime table, state code
        layers state tax onto Roth conversion math, and turning off the
        subject flag excludes this contact from the analyzer pass.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <label className="block">
          <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
            Date of birth
          </div>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </label>
        <label className="block">
          <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
            Spouse date of birth
            <span className="text-[10px] text-[var(--ink-subtle)] font-normal ml-1">
              — only used if &gt;10 yrs younger
            </span>
          </div>
          <input
            type="date"
            value={spouseDob}
            onChange={(e) => setSpouseDob(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </label>
        <label className="block">
          <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
            State (residence)
          </div>
          <select
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className={`${inputClass} w-full`}
          >
            <option value="">— None —</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 mt-6 select-none">
          <input
            type="checkbox"
            checked={planningSubject}
            onChange={(e) => setPlanningSubject(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          <span className="text-xs text-[var(--ink)]">
            Include in planning agents
          </span>
          <span className="text-[10px] text-[var(--ink-subtle)] mono ml-2">
            (turn off for household admins, kids, etc.)
          </span>
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          ) : null}
          {saving ? "Saving…" : "Save planning profile"}
        </button>
        {savedAt && !saving && !err && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--verified)]">
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Saved
          </span>
        )}
        {err && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--danger)]">
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            {err}
          </span>
        )}
      </div>
    </section>
  );
}
