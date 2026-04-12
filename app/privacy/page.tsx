import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — Drift",
  description: "How Drift collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="April 11, 2026">
      <p>
        This Privacy Policy describes how Drift AI (&ldquo;Drift&rdquo;, &ldquo;we&rdquo;) collects,
        uses, and shares information when you use the Drift platform. We take
        privacy seriously and have designed Drift with data minimization,
        workspace isolation, and encryption in mind.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>Information you provide</h3>
      <ul>
        <li>
          <strong>Account data:</strong> name, email, password hash, company,
          role.
        </li>
        <li>
          <strong>Workspace data:</strong> agents, scenarios, contacts, messages,
          conversation transcripts, knowledge base documents, and automations
          you create.
        </li>
        <li>
          <strong>Billing data:</strong> payment method details processed by our
          payment processor (Stripe). We never see your full card number.
        </li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Usage data:</strong> pages visited, features used, timestamps,
          and referring URLs.
        </li>
        <li>
          <strong>Device data:</strong> IP address, browser type, operating
          system.
        </li>
        <li>
          <strong>Error data:</strong> we capture application errors via Sentry
          to diagnose and fix bugs; stack traces may include the page you were
          on but not the content of your Customer Data.
        </li>
      </ul>

      <h2>2. How We Use Information</h2>
      <ul>
        <li>To provide, maintain, and improve the Service.</li>
        <li>To authenticate you and secure your account.</li>
        <li>To process payments and send billing notices.</li>
        <li>To send operational emails (security alerts, product updates).</li>
        <li>To detect, prevent, and address fraud, abuse, and security issues.</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal information. We do{" "}
        <strong>not</strong> use Customer Data to train foundation models without
        explicit consent.
      </p>

      <h2>3. Sharing &amp; Subprocessors</h2>
      <p>
        We share limited data with trusted subprocessors that help us operate
        the Service:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — primary database and authentication.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting and edge network.
        </li>
        <li>
          <strong>Stripe</strong> — payment processing.
        </li>
        <li>
          <strong>Twilio</strong> — SMS and voice infrastructure (only for
          messages/calls you send through the Service).
        </li>
        <li>
          <strong>ElevenLabs / VAPI / OpenAI / Anthropic</strong> — voice
          synthesis and language model inference for agent responses.
        </li>
        <li>
          <strong>Sentry</strong> — error monitoring.
        </li>
      </ul>
      <p>
        Each subprocessor is bound by a data processing agreement. A current
        list of subprocessors is available on request at{" "}
        <a href="mailto:privacy@driftai.studio">privacy@driftai.studio</a>.
      </p>

      <h2>4. Data Retention</h2>
      <p>
        We retain Customer Data for as long as your workspace is active. On
        cancellation you have 30 days to export your data before it is deleted.
        Backups are purged within 35 days of deletion. Some records (e.g. billing
        invoices) are retained longer where required by law.
      </p>

      <h2>5. Your Rights</h2>
      <p>
        Depending on where you live, you may have the following rights regarding
        your personal data:
      </p>
      <ul>
        <li>Access — request a copy of the personal data we hold about you.</li>
        <li>Correction — ask us to correct inaccurate personal data.</li>
        <li>Deletion — ask us to delete your personal data.</li>
        <li>
          Portability — request an export of your workspace data in a
          machine-readable format.
        </li>
        <li>
          Objection — object to certain processing activities (e.g. marketing).
        </li>
      </ul>
      <p>
        To exercise any of these rights, email{" "}
        <a href="mailto:privacy@driftai.studio">privacy@driftai.studio</a>.
      </p>

      <h2>6. International Transfers</h2>
      <p>
        Drift is operated from the United States. If you access the Service from
        outside the US, your data may be transferred to and processed in the US.
        We rely on Standard Contractual Clauses with our subprocessors to cover
        EU/UK data transfers.
      </p>

      <h2>7. Children</h2>
      <p>
        Drift is not directed to children under 16. We do not knowingly collect
        personal information from children. If you believe a child has provided
        us with personal information, please contact us and we will delete it.
      </p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes
        will be announced via email or in-app notification at least 30 days
        before they take effect.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about this Privacy Policy or your data? Email{" "}
        <a href="mailto:privacy@driftai.studio">privacy@driftai.studio</a>.
      </p>
    </LegalLayout>
  );
}
