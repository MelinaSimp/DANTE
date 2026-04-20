"use client";

import { useState } from "react";
import { Shield, Copy, Check } from "lucide-react";
import { toast } from "@/components/ui/toast";

type Protocol = "saml" | "oidc";

export default function SSOSetupClient({ workspaceId }: { workspaceId: string }) {
  const [protocol, setProtocol] = useState<Protocol>("saml");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // SAML state
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [certificate, setCertificate] = useState("");

  // OIDC state
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  // Enforce domain
  const [enforceDomain, setEnforceDomain] = useState("");

  const acsUrl = `https://driftai.studio/api/auth/sso/${workspaceId}/acs`;
  const audienceUri = `https://driftai.studio/sso/${workspaceId}`;
  const oidcRedirectUri = `https://driftai.studio/api/auth/sso/${workspaceId}/callback`;

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Unable to copy");
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // NOTE: SSO activation is currently a manual step. We accept the
    // configuration but do not wire it to the auth flow until the
    // customer has signed an Enterprise order form.
    setSaved(true);
    toast.success(
      "Configuration saved. Our team will reach out within one business day to activate SSO."
    );
  };

  return (
    <div className="space-y-8">
      {/* Status banner */}
      <div className="rounded-[6px] border border-[var(--flag)]/30 bg-[var(--flag-soft)] p-5 flex items-start gap-4">
        <Shield
          className="h-5 w-5 text-[var(--flag)] shrink-0 mt-0.5"
          strokeWidth={1.5}
        />
        <div className="text-sm text-[var(--ink)]">
          <p className="font-medium text-[var(--flag)]">
            SSO is an Enterprise plan feature
          </p>
          <p className="mt-1 text-[var(--ink-muted)]">
            You can capture your IdP configuration below at any time, but SSO will not be active
            for sign-in until your Enterprise plan is provisioned. Contact{" "}
            <a
              href="mailto:sales@driftai.studio"
              className="text-[var(--accent)] underline underline-offset-2 hover:brightness-90"
            >
              sales@driftai.studio
            </a>{" "}
            to start the process.
          </p>
        </div>
      </div>

      {/* Service Provider metadata — what the customer gives their IdP */}
      <div className="card-flat p-6">
        <h2 className="heading-display text-2xl text-[var(--ink)]">Service provider metadata</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Give these values to your identity provider when you create the Drift application.
        </p>
        <div className="mt-5 space-y-4">
          <ReadOnlyField
            label="ACS / Callback URL"
            value={acsUrl}
            onCopy={() => copy(acsUrl, "acs")}
            copied={copied === "acs"}
          />
          <ReadOnlyField
            label="Audience / Entity URI"
            value={audienceUri}
            onCopy={() => copy(audienceUri, "aud")}
            copied={copied === "aud"}
          />
          <ReadOnlyField
            label="OIDC Redirect URI"
            value={oidcRedirectUri}
            onCopy={() => copy(oidcRedirectUri, "redir")}
            copied={copied === "redir"}
          />
        </div>
      </div>

      {/* Protocol selector */}
      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="label-section mb-2 block">Protocol</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setProtocol("saml")}
              className={`px-4 py-2 rounded-[4px] border text-sm font-medium transition ${
                protocol === "saml"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
              }`}
            >
              SAML 2.0
            </button>
            <button
              type="button"
              onClick={() => setProtocol("oidc")}
              className={`px-4 py-2 rounded-[4px] border text-sm font-medium transition ${
                protocol === "oidc"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
              }`}
            >
              OpenID Connect
            </button>
          </div>
        </div>

        {protocol === "saml" ? (
          <div className="space-y-4">
            <Field
              label="Identity Provider Entity ID"
              value={entityId}
              onChange={setEntityId}
              placeholder="https://idp.example.com/saml/metadata"
            />
            <Field
              label="Identity Provider SSO URL"
              value={ssoUrl}
              onChange={setSsoUrl}
              placeholder="https://idp.example.com/saml/sso"
            />
            <TextareaField
              label="X.509 Certificate (PEM)"
              value={certificate}
              onChange={setCertificate}
              placeholder={"-----BEGIN CERTIFICATE-----\nMIIDXjCCAkYCCQ...\n-----END CERTIFICATE-----"}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <Field
              label="Issuer URL"
              value={issuerUrl}
              onChange={setIssuerUrl}
              placeholder="https://idp.example.com/realms/drift"
            />
            <Field
              label="Client ID"
              value={clientId}
              onChange={setClientId}
              placeholder="drift-prod"
            />
            <Field
              label="Client Secret"
              value={clientSecret}
              onChange={setClientSecret}
              placeholder="••••••••••••"
              type="password"
            />
          </div>
        )}

        <Field
          label="Enforce domain (optional)"
          value={enforceDomain}
          onChange={setEnforceDomain}
          placeholder="yourcompany.com"
          help="Only emails from this domain will be allowed to sign in via password; everyone else must go through SSO."
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:bg-[var(--ink)]/90 text-[var(--canvas)] text-sm font-medium transition"
          >
            Save configuration
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--verified)]">
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> Saved — sales will be in touch.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  help?: string;
}) {
  return (
    <div>
      <label className="label-section mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition"
      />
      {help && <p className="mt-1.5 text-xs text-[var(--ink-subtle)]">{help}</p>}
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label-section mb-1.5 block">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-xs mono text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent)] focus:outline-none transition"
      />
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div>
      <label className="label-section mb-1.5 block">{label}</label>
      <div className="flex items-center gap-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-3 py-2.5">
        <code className="flex-1 text-xs mono text-[var(--ink)] truncate">{value}</code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 text-[var(--ink-subtle)] hover:text-[var(--ink)] transition"
          aria-label="Copy"
        >
          {copied ? (
            <Check className="h-4 w-4 text-[var(--verified)]" strokeWidth={1.5} />
          ) : (
            <Copy className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}
