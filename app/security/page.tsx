import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Security — Drift",
  description: "How Drift keeps your data and your customers' data safe.",
};

export default function SecurityPage() {
  return (
    <LegalLayout title="Security" lastUpdated="April 11, 2026">
      <p>
        Drift is built for teams who can&apos;t afford to guess about security.
        This page summarizes the controls we have in place today. For
        enterprise security reviews, DPAs, penetration-test reports, or our
        SOC 2 readiness status, contact{" "}
        <a href="mailto:security@driftai.studio">security@driftai.studio</a>.
      </p>

      <h2>Infrastructure</h2>
      <ul>
        <li>
          <strong>Hosting:</strong> the Drift application runs on Vercel&apos;s
          global edge network. Our primary database runs on Supabase
          (Postgres) in AWS us-east-1.
        </li>
        <li>
          <strong>Encryption in transit:</strong> all traffic to Drift is
          served over TLS 1.2+. HSTS is enforced.
        </li>
        <li>
          <strong>Encryption at rest:</strong> Customer Data is encrypted at
          rest using AES-256 at the database and storage layer.
        </li>
        <li>
          <strong>Network isolation:</strong> our database is not exposed to
          the public internet; application servers connect via private
          networking.
        </li>
      </ul>

      <h2>Access control</h2>
      <ul>
        <li>
          <strong>Workspace isolation:</strong> every workspace&apos;s data is
          isolated using Postgres Row-Level Security. Queries are scoped to
          the caller&apos;s workspace at the database layer — not just the
          application layer.
        </li>
        <li>
          <strong>Role-based access:</strong> workspace members have
          differentiated roles (owner, admin, member) with least-privilege
          defaults.
        </li>
        <li>
          <strong>Least-privilege internal access:</strong> only a small number
          of Drift engineers have production database access, gated by
          hardware-backed authentication.
        </li>
        <li>
          <strong>Audit logs:</strong> sensitive actions (role changes,
          agent deployment, data export) are recorded with actor, timestamp,
          and target — visible to workspace admins.
        </li>
      </ul>

      <h2>Application security</h2>
      <ul>
        <li>
          <strong>Authentication:</strong> password-based sign-in uses
          Supabase Auth with bcrypt hashing. Passwords are never stored in
          plaintext. SSO (SAML/OIDC) is available on enterprise plans.
        </li>
        <li>
          <strong>Secret management:</strong> API keys, tokens, and other
          secrets are stored in Vercel&apos;s encrypted environment variables
          and never committed to source control.
        </li>
        <li>
          <strong>Dependency hygiene:</strong> we monitor our dependency graph
          for known vulnerabilities and apply patches promptly.
        </li>
        <li>
          <strong>Error monitoring:</strong> we capture exceptions via Sentry
          with PII-scrubbing enabled.
        </li>
      </ul>

      <h2>Data handling</h2>
      <ul>
        <li>
          <strong>No model training on your data:</strong> we do not use
          Customer Data to train foundation models.
        </li>
        <li>
          <strong>Subprocessors:</strong> we use a small, vetted list of
          subprocessors (Supabase, Vercel, Stripe, Twilio, OpenAI / Anthropic /
          ElevenLabs / VAPI, Sentry). Each is bound by a DPA.
        </li>
        <li>
          <strong>Data portability:</strong> workspace owners can export all
          workspace data at any time from settings.
        </li>
        <li>
          <strong>Data deletion:</strong> on workspace cancellation, Customer
          Data is retained for 30 days, then permanently deleted. Backups
          are purged within 35 days.
        </li>
      </ul>

      <h2>Operational security</h2>
      <ul>
        <li>
          <strong>Incident response:</strong> we maintain an internal incident
          response runbook. In the event of a security incident affecting
          Customer Data, we will notify affected workspace owners within the
          timeframes required by applicable law.
        </li>
        <li>
          <strong>Backups:</strong> the primary database is backed up daily
          with point-in-time recovery. Backups are encrypted.
        </li>
        <li>
          <strong>Uptime:</strong> current system status is available at{" "}
          <a href="/status">driftai.studio/status</a>.
        </li>
      </ul>

      <h2>Compliance</h2>
      <p>
        We are actively working toward SOC 2 Type II. We sign DPAs and rely on
        Standard Contractual Clauses for EU/UK transfers. Enterprise customers
        can request the current compliance package, vendor security
        questionnaire responses, and subprocessor list at{" "}
        <a href="mailto:security@driftai.studio">security@driftai.studio</a>.
      </p>

      <h2>Reporting a vulnerability</h2>
      <p>
        Security researchers: please report suspected vulnerabilities to{" "}
        <a href="mailto:security@driftai.studio">security@driftai.studio</a>.
        We commit to acknowledging reports within 2 business days and will not
        pursue legal action against good-faith research that follows
        responsible disclosure.
      </p>
    </LegalLayout>
  );
}
