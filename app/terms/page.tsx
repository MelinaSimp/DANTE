import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of Service — Drift",
  description: "Drift terms of service and customer agreement.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="April 11, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the
        Drift platform, including any associated websites, APIs, and services
        (collectively, the &ldquo;Service&rdquo;) provided by Drift AI
        (&ldquo;Drift&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By accessing or using the Service, you agree
        to be bound by these Terms. If you are entering into these Terms on behalf
        of a company or other legal entity, you represent that you have the authority
        to bind that entity.
      </p>

      <h2>1. Accounts &amp; Workspaces</h2>
      <p>
        To use the Service you must create an account and a workspace. You are
        responsible for maintaining the security of your credentials and for all
        activity that occurs under your account. You must promptly notify us of
        any unauthorized use of your account.
      </p>

      <h2>2. Your Content</h2>
      <p>
        You retain all rights to the content, data, and materials you upload or
        otherwise submit to the Service (&ldquo;Customer Data&rdquo;). You grant us a
        limited license to host, process, and transmit Customer Data solely to
        operate the Service and provide it to you. We do not sell Customer Data
        and we do not use Customer Data to train foundation models without your
        explicit permission.
      </p>

      <h2>3. Acceptable Use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Violate any applicable law, regulation, or third-party right.</li>
        <li>
          Send unsolicited communications, spam, or messages in a manner that
          violates TCPA, CAN-SPAM, GDPR, or other applicable laws.
        </li>
        <li>
          Attempt to gain unauthorized access to any portion of the Service, other
          accounts, or the systems or networks connected to the Service.
        </li>
        <li>
          Interfere with or disrupt the integrity or performance of the Service.
        </li>
        <li>
          Use the Service to generate content that is defamatory, harassing,
          fraudulent, or intended to deceive end users about the involvement of
          an AI agent.
        </li>
      </ul>

      <h2>4. Fees &amp; Payment</h2>
      <p>
        Paid plans are billed in advance on a monthly or annual basis. Fees are
        non-refundable except as required by law or as expressly stated in your
        order form. You are responsible for all applicable taxes. We may change
        our fees with at least 30 days&apos; notice; changes do not apply retroactively.
      </p>

      <h2>5. Termination</h2>
      <p>
        You may cancel your subscription at any time from your workspace billing
        settings. We may suspend or terminate your access to the Service
        immediately if you materially breach these Terms. On termination, you
        may export your Customer Data for 30 days, after which we may delete it.
      </p>

      <h2>6. Warranty Disclaimers</h2>
      <p>
        EXCEPT AS EXPRESSLY PROVIDED, THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT
        WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WARRANTIES
        OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT. AI-GENERATED RESPONSES MAY CONTAIN ERRORS; YOU ARE
        RESPONSIBLE FOR REVIEWING OUTPUT BEFORE RELYING ON IT FOR CRITICAL
        DECISIONS.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, DRIFT&apos;S AGGREGATE LIABILITY
        ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE WILL NOT EXCEED
        THE AMOUNT YOU PAID TO DRIFT IN THE 12 MONTHS PRECEDING THE EVENT
        GIVING RISE TO THE CLAIM. IN NO EVENT WILL DRIFT BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
      </p>

      <h2>8. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, without
        regard to its conflict of laws principles. Any dispute arising out of
        these Terms will be resolved in the state or federal courts located in
        Delaware.
      </p>

      <h2>9. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material changes,
        we will notify you via email or through the Service at least 30 days
        before the changes take effect. Your continued use of the Service after
        the effective date constitutes acceptance of the updated Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these Terms? Email us at{" "}
        <a href="mailto:driftaillc@gmail.com">driftaillc@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
