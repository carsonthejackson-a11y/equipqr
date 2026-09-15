import type { Metadata } from "next";
import Link from "next/link";
import { Code, LegalLayout, type LegalSection } from "../_components/legal";
import { SUPPORT_EMAIL } from "@/lib/site";

const LAST_UPDATED = "September 3, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern use of EquipQR.",
};

// Section text is verbatim from the previous version of this page; only the
// structure (ids, numbering, layout) changed in the 2026-09 redesign.
const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Who these terms apply to",
    body: (
      <p>
        These Terms of Service (&quot;Terms&quot;) are an agreement between you, acting on
        behalf of a business (&quot;Customer,&quot; &quot;you&quot;), and EquipQR
        (&quot;EquipQR,&quot; &quot;we,&quot; &quot;us&quot;). They cover the EquipQR
        dashboard, the public equipment pages served at links beginning with{" "}
        <Code>/e/</Code>, and related services (together, the &quot;Service&quot;). They do
        not create any obligation between EquipQR and your customers who scan a QR code or
        submit a service request — that relationship is between you and them.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts",
    body: (
      <p>
        You must provide accurate information to create an account and are responsible for
        everything that happens under it, including actions taken by team members you
        invite. Notify us promptly at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if you believe your account
        has been compromised.
      </p>
    ),
  },
  {
    id: "billing",
    title: "Subscriptions, trials, and billing",
    body: (
      <>
        <p>
          New accounts start with a free trial period stated at signup, with full features of
          our Pro plan unlocked and no payment method required. At the end of the trial, you
          choose a paid plan to continue; if you don&apos;t, your account and public equipment
          pages are paused until you subscribe.
        </p>
        <p>
          Paid subscriptions are billed in advance on a monthly or annual basis and renew
          automatically until cancelled. You can cancel at any time from your account
          settings; cancellation takes effect at the end of the billing period you&apos;ve
          already paid for, and we do not provide partial refunds for unused time except
          where required by law. Each plan has a stated limit on active equipment records;
          we do not charge overage fees, but you&apos;ll be prompted to upgrade before adding
          equipment beyond your plan&apos;s limit. Payment is processed by our payment
          processor (currently Stripe) — EquipQR does not receive or store your full card
          number.
        </p>
      </>
    ),
  },
  {
    id: "content",
    title: "Your content and data",
    body: (
      <p>
        You retain ownership of the data you and your customers put into the Service,
        including equipment records, customer records, troubleshooting guides, service
        requests, and any photos or video submitted with them (&quot;Customer
        Content&quot;). You grant EquipQR a license to host, process, and display Customer
        Content solely to provide and support the Service, including using it with
        third-party subprocessors described in our{" "}
        <Link href="/privacy">Privacy Policy</Link>. You&apos;re responsible for having the
        rights and permissions needed to submit Customer Content, including any consents
        required to collect your customers&apos; information and media.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Violate any law or the rights of a third party;</li>
          <li>
            Upload content that is unlawful, harassing, or that you don&apos;t have the right
            to share;
          </li>
          <li>Attempt to access another company&apos;s data or bypass access controls;</li>
          <li>
            Probe, scan, or interfere with the Service&apos;s infrastructure or availability;
            or
          </li>
          <li>Resell or white-label the Service without a separate written agreement.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI-generated content",
    body: (
      <p>
        The Service uses AI models to help draft troubleshooting guides, power the
        chat-style assistant on public equipment pages, and summarize service requests. AI
        output can be inaccurate or incomplete. You&apos;re responsible for reviewing
        AI-drafted guides before publishing them, and neither guides nor AI summaries should
        be relied on for situations involving safety risk, electrical, gas, or refrigerant
        hazards, or regulated equipment without independent verification by a qualified
        technician.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and support",
    body: (
      <p>
        We work to keep the Service available and will give notice of planned maintenance
        where practical, but we don&apos;t guarantee uninterrupted availability. Support
        response targets for your plan are described on our{" "}
        <Link href="/pricing">pricing page</Link> and are targets, not guarantees.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    body: (
      <p>
        You may stop using the Service and cancel your subscription at any time. We may
        suspend or terminate accounts that violate these Terms, that we reasonably believe
        put the Service or other customers at risk, or for non-payment, with notice where
        practical. Upon termination, we will make reasonable efforts to allow you to export
        your Customer Content for a limited period before deletion, except where prohibited
        by law or where the account was terminated for abuse.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available.&quot; To the
        maximum extent permitted by law, EquipQR disclaims all warranties, express or
        implied, including merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that troubleshooting guides or AI output will
        resolve any particular equipment issue.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <p>
        To the maximum extent permitted by law, EquipQR and its officers, employees, and
        suppliers will not be liable for any indirect, incidental, special, consequential,
        or punitive damages, or for lost profits, revenue, or data, arising out of or
        related to the Service, even if advised of the possibility of such damages. Our
        total liability arising out of or related to these Terms or the Service will not
        exceed the amount you paid us in the twelve months before the claim arose.
      </p>
    ),
  },
  {
    id: "indemnification",
    title: "Indemnification",
    body: (
      <p>
        You agree to indemnify and hold EquipQR harmless from claims, damages, and expenses
        (including reasonable attorneys&apos; fees) arising from your Customer Content, your
        use of the Service in violation of these Terms, or your violation of any law or
        third-party right.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms from time to time. If we make material changes, we&apos;ll
        provide notice, such as by email or an in-app notice, before they take effect.
        Continued use of the Service after changes take effect constitutes acceptance of the
        updated Terms.
      </p>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law",
    body: (
      <p>
        These Terms are governed by the laws of the State of Texas, without regard to its
        conflict-of-laws principles. Any dispute arising out of these Terms or the Service
        will be brought exclusively in the state or federal courts located in Texas, and you
        consent to personal jurisdiction there.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these Terms can be sent to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      description="These terms govern your use of EquipQR. By creating an account or using the service, you agree to them."
      lastUpdated={LAST_UPDATED}
      sections={sections}
      seeAlso={[
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/security", label: "Security" },
      ]}
    />
  );
}
