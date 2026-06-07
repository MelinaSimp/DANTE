"use client";

// app/dante/workflows/[workflowId]/canvas/StepConfigForm.tsx
//
// Per-step config form, rendered inside the right-hand drawer when
// a node is selected on the canvas. One <StepConfigForm /> per node;
// the parent editor owns the state and passes an onChange callback.

import type { WorkflowStep, TriggerInputField } from "@/lib/dante/workflow-types";

// We loosen the patch type to `Record<string, unknown>` because
// WorkflowStep is a discriminated union — a `Partial<WorkflowStep>`
// can't have a `config` key that's valid across all branches, but
// the form is scoped to one step at a time, so a free-form patch is
// fine. The parent merges it back onto the concrete step.
export type StepPatch = { name?: string; on_error?: "stop" | "continue"; config?: Record<string, unknown> };

interface Props {
  step: WorkflowStep;
  onChange: (patch: StepPatch) => void;
}

export default function StepConfigForm({ step, onChange }: Props) {
  const cfg = (step.config || {}) as Record<string, unknown>;

  const setConfig = (key: string, value: unknown) => {
    onChange({ config: { ...cfg, [key]: value } });
  };

  return (
    <div className="space-y-4">
      {/* Always-shown: step name */}
      <Field label="Step name">
        <input
          value={step.name || ""}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
        />
      </Field>

      {renderBody(step, cfg, setConfig)}

      {/* Always-shown: on-error behavior, not applicable to triggers */}
      {!step.type.startsWith("trigger_") && (
        <Field label="On error">
          <select
            value={step.on_error || "stop"}
            onChange={(e) => onChange({ on_error: e.target.value as "stop" | "continue" })}
            className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
          >
            <option value="stop">Stop workflow</option>
            <option value="continue">Continue to next step</option>
          </select>
        </Field>
      )}
    </div>
  );
}

// ── Per-type form bodies ──────────────────────────────────────

function renderBody(
  step: WorkflowStep,
  cfg: Record<string, unknown>,
  setConfig: (k: string, v: unknown) => void,
) {
  switch (step.type) {
    case "trigger_manual": {
      const fields = (cfg.input_fields || []) as TriggerInputField[];
      const updateField = (idx: number, patch: Partial<TriggerInputField>) => {
        const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
        setConfig("input_fields", next);
      };
      const addField = () => {
        setConfig("input_fields", [...fields, { name: "", label: "", type: "text" as const, required: false, placeholder: "" }]);
      };
      const removeField = (idx: number) => {
        setConfig("input_fields", fields.filter((_, i) => i !== idx));
      };
      return (
        <>
          <Help>
            This trigger fires when someone clicks <b>Run</b> in this editor,
            or when <code className="mono">POST /api/dante/workflows/{"{id}"}/run</code>
            is called with a session. Define input fields below to prompt the
            user for values when they click Run. Access them downstream with{" "}
            <code className="mono">{"{{steps.trigger.input.<field_name>}}"}</code>.
          </Help>
          <div className="space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide">
                Input fields
              </span>
              <button onClick={addField} type="button"
                className="text-xs text-[var(--accent)] hover:underline">
                + Add field
              </button>
            </div>
            {fields.map((f, i) => (
              <div key={i} className="border border-[var(--rule)] rounded-[4px] p-3 space-y-2 bg-[var(--canvas-subtle)]">
                <div className="flex gap-2">
                  <Text value={f.name || ""} onChange={(v) => updateField(i, { name: v.replace(/\s+/g, "_").toLowerCase() })} placeholder="field_name" />
                  <Text value={f.label || ""} onChange={(v) => updateField(i, { label: v })} placeholder="Display label" />
                  <button onClick={() => removeField(i)} type="button"
                    className="text-[var(--ink-muted)] hover:text-[var(--danger)] shrink-0 p-1">
                    <span className="text-xs">x</span>
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <select value={f.type || "text"}
                    onChange={(e) => updateField(i, { type: e.target.value as "text" | "textarea" | "number" })}
                    className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-2 py-1 text-xs text-[var(--ink)]">
                    <option value="text">Text</option>
                    <option value="textarea">Long text</option>
                    <option value="number">Number</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-[var(--ink-muted)]">
                    <input type="checkbox" checked={!!f.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })} />
                    Required
                  </label>
                </div>
                <Text value={f.placeholder || ""} onChange={(v) => updateField(i, { placeholder: v })} placeholder="Placeholder text (optional)" />
              </div>
            ))}
            {fields.length === 0 && (
              <p className="text-xs text-[var(--ink-muted)]">
                No input fields. The Run button will execute immediately without prompting.
              </p>
            )}
          </div>
        </>
      );
    }

    case "trigger_cron":
      return (
        <>
          <Field label="Crontab (UTC)" hint="5-field format: m h dom mon dow. Example: 0 9 * * * = 09:00 UTC daily">
            <Text
              value={(cfg.cron as string) || ""}
              onChange={(v) => setConfig("cron", v)}
              placeholder="0 9 * * *"
            />
          </Field>
          <Help>
            Schedules run on the n8n engine.
            Uses UTC timezone.
          </Help>
        </>
      );

    case "trigger_webhook":
      return (
        <Help>
          Save the workflow, then mint a token in the header to get
          the <code className="mono">POST /api/dante/hooks/{"{token}"}</code> URL.
          The request body is passed to downstream nodes as
          <code className="mono"> {"{{steps."}{step.id}{".input.<field>}}"}</code>.
        </Help>
      );

    case "http":
      return (
        <>
          <Field label="URL">
            <Text value={(cfg.url as string) || ""} onChange={(v) => setConfig("url", v)} placeholder="https://api.example.com/endpoint" />
          </Field>
          <Field label="Method">
            <select
              value={(cfg.method as string) || "GET"}
              onChange={(e) => setConfig("method", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Headers (JSON)">
            <Json value={cfg.headers} onChange={(v) => setConfig("headers", v)} rows={3} placeholder='{"Authorization": "Bearer …"}' />
          </Field>
          <Field label="Body (JSON)">
            <Json value={cfg.body} onChange={(v) => setConfig("body", v)} rows={4} placeholder='{"key": "value"}' />
          </Field>
        </>
      );

    case "openai":
      return (
        <>
          <Field label="Model">
            <Text value={(cfg.model as string) || ""} onChange={(v) => setConfig("model", v)} placeholder="gpt-4o-mini" />
          </Field>
          <Field label="System">
            <Textarea value={(cfg.system as string) || ""} onChange={(v) => setConfig("system", v)} rows={2} placeholder="You are a helpful assistant." />
          </Field>
          <Field label="Prompt" hint={"Reference earlier step output with {{steps.<id>.<field>}}"}>
            <Textarea value={(cfg.prompt as string) || ""} onChange={(v) => setConfig("prompt", v)} rows={6} placeholder="Summarize this: {{steps.trigger.input.message}}" />
          </Field>
          <Field label="Max tokens">
            <Text value={String(cfg.max_tokens ?? "")} onChange={(v) => setConfig("max_tokens", v)} placeholder="800" />
          </Field>
        </>
      );

    case "query_clients":
      return (
        <>
          <Field label="Filter (JSON)" hint="Equality only. Columns: id, name, email, phone, created_at">
            <Json value={cfg.filter} onChange={(v) => setConfig("filter", v)} rows={3} placeholder='{"email": "alice@example.com"}' />
          </Field>
          <Field label="Limit">
            <Text value={String(cfg.limit ?? "")} onChange={(v) => setConfig("limit", v)} placeholder="25" />
          </Field>
        </>
      );

    case "update_contact":
      return (
        <>
          <Field label="Contact ID" hint="Use a template like {{steps.find.contacts.0.id}}">
            <Text value={(cfg.contact_id as string) || ""} onChange={(v) => setConfig("contact_id", v)} placeholder="{{steps.find.contacts.0.id}}" />
          </Field>
          <Field label="Patch (JSON)">
            <Json value={cfg.patch} onChange={(v) => setConfig("patch", v)} rows={4} placeholder='{"phone": "+1555…"}' />
          </Field>
        </>
      );

    case "send_email":
      return (
        <>
          <Field label="To">
            <Text value={(cfg.to as string) || ""} onChange={(v) => setConfig("to", v)} placeholder="alice@example.com" />
          </Field>
          <Field label="Subject">
            <Text value={(cfg.subject as string) || ""} onChange={(v) => setConfig("subject", v)} placeholder="Follow-up from Drift" />
          </Field>
          <Field label="HTML body">
            <Textarea value={(cfg.html as string) || ""} onChange={(v) => setConfig("html", v)} rows={4} />
          </Field>
          <Field label="Text body">
            <Textarea value={(cfg.text as string) || ""} onChange={(v) => setConfig("text", v)} rows={3} />
          </Field>
        </>
      );

    case "condition":
      return (
        <>
          <Field label="Expression" hint={'Ops: contains, ==, !=, >, <, >=, <=. Example: {{steps.score.text}} contains "yes"'}>
            <Text value={(cfg.expression as string) || ""} onChange={(v) => setConfig("expression", v)} placeholder='{{steps.classify.text}} contains "yes"' />
          </Field>
          <Help>
            Outgoing edges branch on the expression. Connect the green
            handle for <b>true</b> and the red handle for <b>false</b>.
          </Help>
        </>
      );

    case "delay":
      return (
        <Field label="Seconds" hint="Capped at 60 — longer waits need a real queue (phase 3)">
          <Text value={String(cfg.seconds ?? "")} onChange={(v) => setConfig("seconds", v)} placeholder="5" />
        </Field>
      );

    case "archive_lookup":
      return (
        <>
          <Field label="Query" hint={"Vector-searched against the Dante archive. Template-safe — reference prior step output with {{steps.<id>.<field>}}."}>
            <Textarea
              value={(cfg.query as string) || ""}
              onChange={(v) => setConfig("query", v)}
              rows={3}
              placeholder='What fee disclosures do we require for held-away accounts?'
            />
          </Field>
          <Field label="Top-K" hint="1–20. Chunks returned.">
            <Text value={String(cfg.k ?? "5")} onChange={(v) => setConfig("k", v)} placeholder="5" />
          </Field>
          <Field label="Kind filter (optional)" hint="Restrict to one document kind.">
            <select
              value={(cfg.kind as string) || ""}
              onChange={(e) => setConfig("kind", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="">All kinds</option>
              <option value="lease">Lease</option>
              <option value="policy">Policy / SOP</option>
              <option value="memo">Memo</option>
              <option value="comp">Comp / market data</option>
              <option value="inspection">Inspection report</option>
              <option value="disclosure">Disclosure</option>
              <option value="deed">Deed</option>
              <option value="insurance">Insurance / COI</option>
              <option value="regulation">Regulation</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Help>
            Downstream: pipe into an <b>OpenAI prompt</b> step and reference
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<this-id>.context}}"}</code>
            to ground the model on cited chunks.
          </Help>
        </>
      );

    case "query_properties":
      return (
        <>
          <Field label="Filter (JSON)" hint="Columns: id, name, address, transaction_stage, lease_end_date, monthly_rent_cents, etc.">
            <Json value={cfg.filter} onChange={(v) => setConfig("filter", v)} rows={3} placeholder='{"transaction_stage": "listed"}' />
          </Field>
          <Field label="Limit">
            <Text value={String(cfg.limit ?? "")} onChange={(v) => setConfig("limit", v)} placeholder="25" />
          </Field>
        </>
      );

    case "query_listings":
      return (
        <>
          <Field label="Filter (JSON)" hint="Columns: id, property_id, list_price_cents, list_date, expires_on, status, commission_pct">
            <Json value={cfg.filter} onChange={(v) => setConfig("filter", v)} rows={3} placeholder='{"status": "active"}' />
          </Field>
          <Field label="Limit">
            <Text value={String(cfg.limit ?? "")} onChange={(v) => setConfig("limit", v)} placeholder="25" />
          </Field>
        </>
      );

    case "query_offers":
      return (
        <>
          <Field label="Filter (JSON)" hint="Columns: id, property_id, listing_id, buyer_contact_id, offer_price_cents, status, closing_target">
            <Json value={cfg.filter} onChange={(v) => setConfig("filter", v)} rows={3} placeholder='{"status": "pending"}' />
          </Field>
          <Field label="Limit">
            <Text value={String(cfg.limit ?? "")} onChange={(v) => setConfig("limit", v)} placeholder="25" />
          </Field>
        </>
      );

    case "lease_lookup":
      return (
        <>
          <Field label="Status filter">
            <select
              value={(cfg.status as string) || "completed"}
              onChange={(e) => setConfig("status", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
            </select>
          </Field>
          <Field label="Limit">
            <Text value={String(cfg.limit ?? "")} onChange={(v) => setConfig("limit", v)} placeholder="10" />
          </Field>
          <Help>
            Returns abstracted lease terms (base rent, escalation, expiration,
            key clauses). Reference via
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<this-id>.abstracts}}"}</code>.
          </Help>
        </>
      );

    case "web_search":
      return (
        <>
          <Field label="Query" hint="Supports {{steps.<id>.<field>}} templates">
            <Textarea value={String(cfg.query ?? "")} onChange={(v) => setConfig("query", v)} rows={2} placeholder="commercial real estate listings in {{steps.trigger.input.market}}" />
          </Field>
          <Field label="Max results">
            <Text value={String(cfg.max_results ?? "")} onChange={(v) => setConfig("max_results", v)} placeholder="5" />
          </Field>
          <Field label="Search depth">
            <select
              value={(cfg.search_depth as string) || "basic"}
              onChange={(e) => setConfig("search_depth", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="basic">Basic</option>
              <option value="advanced">Advanced (slower, more thorough)</option>
            </select>
          </Field>
          <Field label="Include domains (comma-separated)" hint="Only search these domains. Leave blank for all.">
            <Text value={Array.isArray(cfg.include_domains) ? cfg.include_domains.join(", ") : String(cfg.include_domains ?? "")} onChange={(v) => setConfig("include_domains", v.split(",").map((s: string) => s.trim()).filter(Boolean))} placeholder="loopnet.com, crexi.com" />
          </Field>
          <Field label="Exclude domains (comma-separated)" hint="Skip these domains.">
            <Text value={Array.isArray(cfg.exclude_domains) ? cfg.exclude_domains.join(", ") : String(cfg.exclude_domains ?? "")} onChange={(v) => setConfig("exclude_domains", v.split(",").map((s: string) => s.trim()).filter(Boolean))} placeholder="" />
          </Field>
          <Help>
            Searches the web via Tavily. Output includes an AI-generated answer
            and individual result URLs. Reference via
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<this-id>.answer}}"}</code> or
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<this-id>.results}}"}</code>.
          </Help>
        </>
      );

    case "send_sms":
      return (
        <>
          <Field label="Recipient type">
            <select
              value={cfg.to_phone ? "phone" : cfg.to_role ? "role" : cfg.to_member_id ? "member" : "phone"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "phone") { setConfig("to_role", undefined); setConfig("to_member_id", undefined); setConfig("to_phone", cfg.to_phone || ""); }
                if (v === "role")  { setConfig("to_phone", undefined); setConfig("to_member_id", undefined); setConfig("to_role", cfg.to_role || "owner"); }
                if (v === "member") { setConfig("to_phone", undefined); setConfig("to_role", undefined); setConfig("to_member_id", cfg.to_member_id || ""); }
              }}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="phone">Phone number</option>
              <option value="role">Team role</option>
              <option value="member">Specific member</option>
            </select>
          </Field>
          {cfg.to_phone !== undefined && (
            <Field label="Phone (E.164)" hint="+15551234567">
              <Text value={String(cfg.to_phone ?? "")} onChange={(v) => setConfig("to_phone", v)} placeholder="+15551234567" />
            </Field>
          )}
          {cfg.to_role !== undefined && (
            <Field label="Role">
              <select
                value={String(cfg.to_role ?? "owner")}
                onChange={(e) => setConfig("to_role", e.target.value)}
                className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="all">All members</option>
              </select>
            </Field>
          )}
          {cfg.to_member_id !== undefined && (
            <Field label="Member ID">
              <Text value={String(cfg.to_member_id ?? "")} onChange={(v) => setConfig("to_member_id", v)} placeholder="profile uuid" />
            </Field>
          )}
          <Field label="Message body" hint="Supports {{steps.<id>.<field>}} templates">
            <Textarea value={String(cfg.body ?? "")} onChange={(v) => setConfig("body", v)} rows={3} placeholder="Your workflow result: {{steps.search.answer}}" />
          </Field>
        </>
      );

    case "agent":
      return (
        <>
          <Field label="Objective" hint="What should the agent accomplish? Supports {{steps.<id>.<field>}} templates.">
            <Textarea value={String(cfg.objective ?? "")} onChange={(v) => setConfig("objective", v)} rows={3} placeholder="Research commercial listings near {{steps.trigger.input.location}} and summarize the top opportunities." />
          </Field>
          <Field label="Tools (comma-separated)" hint="e.g. web.search, memory.write, clients.query, site_scan.search">
            <Text
              value={Array.isArray(cfg.tools) ? cfg.tools.filter((t: unknown) => typeof t === "string").join(", ") : ""}
              onChange={(v) => setConfig("tools", v.split(",").map((s: string) => s.trim()).filter(Boolean))}
              placeholder="web.search, memory.write, clients.query"
            />
          </Field>
          <Field label="Max steps" hint="1-20. Each step is one tool call.">
            <Text value={String(cfg.max_steps ?? "")} onChange={(v) => setConfig("max_steps", v)} placeholder="8" />
          </Field>
          <Field label="Model">
            <select
              value={String(cfg.model ?? "")}
              onChange={(e) => setConfig("model", e.target.value || undefined)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="">Default (claude-sonnet-4-6)</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4o">GPT-4o</option>
            </select>
          </Field>
          <Field label="System prompt (optional)" hint="Role or persona instructions for the agent.">
            <Textarea value={String(cfg.system ?? "")} onChange={(v) => setConfig("system", v)} rows={2} placeholder="" />
          </Field>
          <Help>
            The agent loops (observe, tool call, observe) until it produces a final
            answer or hits max steps. Each tool call emits its own log entry.
            Reference the final answer via
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<this-id>.text}}"}</code>.
          </Help>
        </>
      );

    case "trigger_at":
      return (
        <>
          <Field label="Fire at (ISO 8601)" hint="The run fires once at this time, then disarms.">
            <Text value={String(cfg.scheduled_for ?? "")} onChange={(v) => setConfig("scheduled_for", v)} placeholder="2026-06-01T09:00:00Z" />
          </Field>
          <Field label="Timezone (optional)">
            <Text value={String(cfg.timezone ?? "")} onChange={(v) => setConfig("timezone", v)} placeholder="America/New_York" />
          </Field>
        </>
      );

    case "integration_query":
      return (
        <>
          <Field label="Provider" hint="Must match a connected integration in Settings > Integrations.">
            <Text value={(cfg.provider as string) || ""} onChange={(v) => setConfig("provider", v)} placeholder="costar" />
          </Field>
          <Field label="Endpoint URL">
            <Text value={(cfg.endpoint as string) || ""} onChange={(v) => setConfig("endpoint", v)} placeholder="https://api.costar.com/v1/properties" />
          </Field>
          <Field label="Method">
            <select
              value={(cfg.method as string) || "GET"}
              onChange={(e) => setConfig("method", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              {["GET", "POST", "PUT", "DELETE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Params (JSON)">
            <Json value={cfg.params} onChange={(v) => setConfig("params", v)} rows={3} placeholder='{"zip": "44113"}' />
          </Field>
          <Field label="Extra headers (JSON)" hint="Authorization is added automatically from stored credentials.">
            <Json value={cfg.headers} onChange={(v) => setConfig("headers", v)} rows={2} placeholder='{}' />
          </Field>
          <Help>
            Credentials are loaded automatically from the integration connection.
            The stored API key is sent as a Bearer token.
          </Help>
        </>
      );

    case "due_diligence":
      return (
        <>
          <Field label="Address" hint="Type a street address and we auto-resolve coordinates + FIPS codes via Google Maps.">
            <Text value={(cfg.address as string) || ""} onChange={(v) => setConfig("address", v)} placeholder="1600 Euclid Ave, Cleveland, OH 44115" />
          </Field>
          <div className="text-[11px] text-center text-[var(--ink-muted)] mono py-1">or enter coordinates manually</div>
          <Field label="Latitude" hint={'Use {{steps.trigger.input.latitude}} for dynamic values.'}>
            <Text value={String(cfg.latitude ?? "")} onChange={(v) => setConfig("latitude", v)} placeholder="41.4993" />
          </Field>
          <Field label="Longitude">
            <Text value={String(cfg.longitude ?? "")} onChange={(v) => setConfig("longitude", v)} placeholder="-81.6944" />
          </Field>
          <Field label="State FIPS" hint="Auto-resolved from address. Manual: Ohio = 39.">
            <Text value={(cfg.state_fips as string) || ""} onChange={(v) => setConfig("state_fips", v)} placeholder="39" />
          </Field>
          <Field label="County FIPS" hint="3-digit code. Cuyahoga = 049.">
            <Text value={(cfg.county_fips as string) || ""} onChange={(v) => setConfig("county_fips", v)} placeholder="049" />
          </Field>
          <Field label="Tract FIPS (optional)" hint="6-digit code. Leave blank to use county-level Census data.">
            <Text value={(cfg.tract_fips as string) || ""} onChange={(v) => setConfig("tract_fips", v)} placeholder="110100" />
          </Field>
          <Field label="Drive-time destinations (optional)" hint='Comma-separated. e.g. "Cleveland Hopkins Airport, I-90 / I-71 interchange"'>
            <Text
              value={(cfg.drive_time_destinations as string) || ""}
              onChange={(v) => setConfig("drive_time_destinations", v)}
              placeholder="Cleveland Hopkins Airport, Progressive Field"
            />
          </Field>
          <Help>
            Pulls Census demographics, BLS employment, FEMA flood zone, and EPA
            environmental data in parallel. With a Google Maps API key connected in
            Settings, also resolves addresses, finds nearby amenities, and calculates
            drive times. Output:
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.location}}"}</code>,
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.nearby_places}}"}</code>,
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.drive_times}}"}</code>,
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.census}}"}</code>,
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.epa}}"}</code>.
          </Help>
        </>
      );

    case "generate_document":
      return (
        <>
          <Field label="Title">
            <Text value={(cfg.title as string) || ""} onChange={(v) => setConfig("title", v)} placeholder="Due Diligence Report" />
          </Field>
          <Field label="Subtitle (optional)">
            <Text value={(cfg.subtitle as string) || ""} onChange={(v) => setConfig("subtitle", v)} placeholder="{{steps.trigger.input.address}}" />
          </Field>
          <Field label="Sections (JSON array)" hint='Each item: {"heading": "...", "body": "..."}'>
            <Json value={cfg.sections} onChange={(v) => setConfig("sections", v)} rows={6} placeholder={'[\n  {"heading": "Summary", "body": "{{steps.analysis.text}}"}\n]'} />
          </Field>
          <Help>
            Generates a branded PDF with your workspace logo and colors.
            The file is uploaded to the vault and a signed download URL is returned as
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.url}}"}</code>.
          </Help>
        </>
      );

    case "for_each":
      return (
        <>
          <Field label="Items" hint="Template that resolves to a JSON array. e.g. {{steps.query.contacts}}">
            <Text value={(cfg.items as string) || ""} onChange={(v) => setConfig("items", v)} placeholder="{{steps.query.contacts}}" />
          </Field>
          <Field label="Action type">
            <select
              value={(cfg.action_type as string) || "send_email"}
              onChange={(e) => setConfig("action_type", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="send_email">Send email</option>
              <option value="update_contact">Update contact</option>
              <option value="http">HTTP request</option>
              <option value="send_sms">Send SMS</option>
              <option value="generate_document">Generate document</option>
              <option value="integration_query">Integration query</option>
            </select>
          </Field>
          <Field label="Action config (JSON)" hint={'Use {{item.<field>}} to reference the current item.'}>
            <Json value={cfg.action_config} onChange={(v) => setConfig("action_config", v)} rows={5} placeholder={'{"to": "{{item.email}}", "subject": "Update", "text": "Hello {{item.name}}"}'} />
          </Field>
          <Help>
            Iterates over each item in the array and executes the selected action.
            Use <code className="mx-1 text-[var(--ink)]">{"{{item.<field>}}"}</code> in
            the action config to reference fields on the current item. Output:
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.total}}"}</code>,
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.succeeded}}"}</code>,
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.failed}}"}</code>.
          </Help>
        </>
      );

    case "transform":
      return (
        <>
          <Field label="Operations (JSON array)" hint='Each: {"action": "set|rename|delete|expression", "field": "output_name", "value": "...", "from": "step_id.path"}'>
            <Json value={cfg.operations} onChange={(v) => setConfig("operations", v)} rows={6} placeholder={'[\n  {"action": "set", "field": "full_address", "value": "{{steps.trigger.input.street}}, {{steps.trigger.input.city}}"}\n]'} />
          </Field>
          <Help>
            Reshape data between steps. Actions:<br />
            <b>set</b> -- assign a value (supports templates).<br />
            <b>rename</b> -- copy a field from a prior step (<code className="text-[var(--ink)]">from</code> = dot path).<br />
            <b>delete</b> -- remove a field.<br />
            <b>expression</b> -- evaluate value as JSON or keep as string.<br />
            Output fields are available as
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.<field>}}"}</code>.
          </Help>
        </>
      );

    case "switch":
      return (
        <>
          <Field label="Expression" hint="The value to match against cases. Supports templates.">
            <Text value={(cfg.expression as string) || ""} onChange={(v) => setConfig("expression", v)} placeholder='{{steps.classify.text}}' />
          </Field>
          <Field label="Cases (JSON array)" hint='Each: {"value": "match_value", "label": "Display name"}. Connect each output handle to a downstream node.'>
            <Json value={cfg.cases} onChange={(v) => setConfig("cases", v)} rows={4} placeholder={'[\n  {"value": "high", "label": "High priority"},\n  {"value": "low", "label": "Low priority"}\n]'} />
          </Field>
          <Field label="Default case ID" hint="Handle ID for unmatched values. Leave as __default__.">
            <Text value={(cfg.default_case as string) || "__default__"} onChange={(v) => setConfig("default_case", v)} placeholder="__default__" />
          </Field>
          <Help>
            Multi-way branch. The resolved expression is compared against each
            case value. The matching output handle fires; if none match, the
            <code className="mx-1 text-[var(--ink)]">__default__</code> handle fires.
            Connect each handle to a different downstream path.
          </Help>
        </>
      );

    case "sub_workflow":
      return (
        <>
          <Field label="Workflow ID" hint="The UUID of the workflow to run as a sub-step.">
            <Text value={(cfg.workflow_id as string) || ""} onChange={(v) => setConfig("workflow_id", v)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Field>
          <Field label="Input (JSON)" hint="Passed as the sub-workflow's trigger input. Supports templates.">
            <Json value={cfg.input} onChange={(v) => setConfig("input", v)} rows={4} placeholder={'{"address": "{{steps.trigger.input.address}}"}'} />
          </Field>
          <Help>
            Runs another workflow in your workspace as a nested step.
            The sub-workflow executes fully before this step completes.
            Output is available as
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.output}}"}</code>.
          </Help>
        </>
      );

    case "approval":
      return (
        <>
          <Field label="Approver role" hint="Who can approve this step.">
            <select
              value={(cfg.approver_role as string) || "any"}
              onChange={(e) => setConfig("approver_role", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="owner">Owner only</option>
              <option value="admin">Admin or above</option>
              <option value="any">Any team member</option>
            </select>
          </Field>
          <Field label="Message" hint="Shown to the approver in email and the approval UI.">
            <Textarea value={(cfg.message as string) || ""} onChange={(v) => setConfig("message", v)} rows={3} placeholder="Please review and approve this workflow step." />
          </Field>
          <Field label="Timeout (hours)" hint="Auto-reject after this many hours. Default 72.">
            <Text value={String(cfg.timeout_hours ?? "72")} onChange={(v) => setConfig("timeout_hours", Number(v) || 72)} placeholder="72" />
          </Field>
          <Help>
            Pauses the workflow and sends an email with approve / reject links.
            The run resumes automatically when someone responds. Downstream nodes
            can check the result via
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.approved}}"}</code>.
          </Help>
        </>
      );

    case "trigger_lease_expiry":
      return (
        <>
          <Field label="Days before expiry" hint="Fires when a lease's expiration date is within this window.">
            <Text value={String(cfg.days_before ?? "90")} onChange={(v) => setConfig("days_before", Number(v) || 90)} placeholder="90" />
          </Field>
          <Help>
            Checked daily by the scheduler. Matching leases are passed as
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<trigger-id>.input.properties}}"}</code>.
            De-duped: won't re-fire within 24h for the same workflow.
          </Help>
        </>
      );

    case "trigger_deal_stage":
      return (
        <>
          <Field label="From stage" hint="The stage the property was in before the change. 'Any' matches all.">
            <select
              value={(cfg.from_stage as string) || ""}
              onChange={(e) => setConfig("from_stage", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="">Any</option>
              {["listed", "showing", "offer", "pending", "closed", "withdrawn", "expired"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="To stage" hint="The stage the property moved to. 'Any' matches all.">
            <select
              value={(cfg.to_stage as string) || ""}
              onChange={(e) => setConfig("to_stage", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="">Any</option>
              {["listed", "showing", "offer", "pending", "closed", "withdrawn", "expired"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Help>
            Fires immediately when a property's pipeline stage changes.
            The property data is available as
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<trigger-id>.input}}"}</code>.
          </Help>
        </>
      );

    case "code":
      return (
        <>
          <Field label="Language">
            <select
              value={(cfg.language as string) || "javascript"}
              onChange={(e) => setConfig("language", e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="javascript">JavaScript</option>
            </select>
          </Field>
          <Field label="Code" hint="Access prior step outputs via the `steps` object. Return an object.">
            <textarea
              value={(cfg.code as string) || ""}
              onChange={(e) => setConfig("code", e.target.value)}
              rows={12}
              placeholder={"// Access prior steps via steps object\n// Return an object with your output\nreturn { result: 'hello' };"}
              className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-[12px] text-[var(--ink)] font-mono leading-relaxed focus:outline-none focus:border-[var(--rule-strong)] resize-y"
              spellCheck={false}
            />
          </Field>
          <Help>
            Write JavaScript that runs server-side. Access prior step outputs
            via the <code className="text-[var(--ink)]">steps</code> object
            (e.g. <code className="text-[var(--ink)]">steps.query_abc123.contacts</code>).
            Must return an object. Output is available as
            <code className="mx-1 text-[var(--ink)]">{"{{steps.<id>.<field>}}"}</code>.
          </Help>
        </>
      );

    case "sticky_note":
      return (
        <Field label="Note content">
          <Textarea
            value={(cfg.content as string) || ""}
            onChange={(v) => setConfig("content", v)}
            rows={6}
            placeholder="Add a note to this canvas..."
          />
        </Field>
      );

    default:
      return null;
  }
}

// ── Input primitives ──────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[var(--ink-subtle)] mt-1">{hint}</p>}
    </div>
  );
}

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)]"
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)] resize-y"
    />
  );
}

// JSON field: uncontrolled textarea, commits on blur. Keeps the user
// from losing their place while typing half-valid JSON.
function Json({
  value, onChange, placeholder, rows = 4,
}: {
  value: unknown; onChange: (v: unknown) => void; placeholder?: string; rows?: number;
}) {
  const initial = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  return (
    <textarea
      key={initial}
      defaultValue={initial}
      placeholder={placeholder}
      rows={rows}
      onBlur={(e) => {
        const t = e.target.value.trim();
        if (!t) { onChange({}); return; }
        try { onChange(JSON.parse(t)); }
        catch { /* leave as-is; user will correct */ }
      }}
      className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)] resize-y"
    />
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px] p-3 leading-relaxed">
      {children}
    </p>
  );
}
