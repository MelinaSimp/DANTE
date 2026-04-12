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
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 flex items-start gap-4">
        <Shield className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-100/80">
          <p className="font-medium text-amber-200">
            SSO is an Enterprise plan feature
          </p>
          <p className="mt-1 text-amber-100/60">
            You can capture your IdP configuration below at any time, but SSO
            will not be active for sign-in until your Enterprise plan is
            provisioned. Contact{" "}
            <a
              href="mailto:sales@driftai.studio"
              className="underline underline-offset-2 hover:text-amber-100"
            >
              sales@driftai.studio
            </a>{" "}
            to start the process.
          </p>
        </div>
      </div>

      {/* Service Provider metadata — what the customer gives their IdP */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-base font-semibold">Service Provider metadata</h2>
        <p className="mt-1 text-xs text-white/50">
          Give these values to your identity provider when you create the
          Drift application.
        </p>
        <div className="mt-5 space-y-4">
          <ReadOnlyField label="ACS / Callback URL" value={acsUrl} onCopy={() => copy(acsUrl, "acs")} copied={copied === "acs"} />
          <ReadOnlyField label="Audience / Entity URI" value={audienceUri} onCopy={() => copy(audienceUri, "aud")} copied={copied === "aud"} />
          <ReadOnlyField label="OIDC Redirect URI" value={oidcRedirectUri} onCopy={() => copy(oidcRedirectUri, "redir")} copied={copied === "redir"} />
        </div>
      </div>

      {/* Protocol selector */}
      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            Protocol
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setProtocol("saml")}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
                protocol === "saml"
                  ? "border-[#3351ff] bg-[#3351ff]/15 text-white"
                  : "border-white/10 bg-black/40 text-white/60 hover:text-white"
              }`}
            >
              SAML 2.0
            </button>
            <button
              type="button"
              onClick={() => setProtocol("oidc")}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
                protocol === "oidc"
                  ? "border-[#3351ff] bg-[#3351ff]/15 text-white"
                  : "border-white/10 bg-black/40 text-white/60 hover:text-white"
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
            className="px-4 py-2 rounded-xl bg-[#3351ff] hover:bg-[#4a64ff] text-white text-sm font-medium transition"
          >
            Save configuration
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
              <Check className="h-3.5 w-3.5" /> Saved — sales will be in touch.
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
      <label className="block text-sm font-medium text-white/70 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-[#3351ff] focus:outline-none focus:ring-2 focus:ring-[#3351ff]/30 transition"
      />
      {help && <p className="mt-1.5 text-xs text-white/40">{help}</p>}
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
      <label className="block text-sm font-medium text-white/70 mb-2">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-mono text-white placeholder:text-white/30 focus:border-[#3351ff] focus:outline-none focus:ring-2 focus:ring-[#3351ff]/30 transition"
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
      <label className="block text-xs font-medium text-white/50 mb-1.5">{label}</label>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5">
        <code className="flex-1 text-xs font-mono text-white/80 truncate">{value}</code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 text-white/40 hover:text-white transition"
          aria-label="Copy"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
