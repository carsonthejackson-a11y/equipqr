import type { Metadata } from "next";
import { LegalHeader, LegalContent, LegalNotice } from "../_components/legal";
import { SUPPORT_EMAIL } from "@/lib/site";

const LAST_UPDATED = "September 3, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern use of EquipQR.",
};

export default function TermsPage() {
  return (
    <>
      <LegalHeader
        title="Terms of Service"
        description="These terms govern your use of EquipQR. By creating an account or using the service, you agree to them."
        lastUpdated={LAST_UPDATED}
      />

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <LegalContent>
          <h2>1. Who these terms apply to</h2>
          <p>
            These Terms of Service (&quot;Terms&quot;) are an agreement between you, acting on
            behalf of a business (&quot;Customer,&quot; &quot;you&quot;), and EquipQR
            (&quot;EquipQR,&quot; &quot;we,&quot; &quot;us&quot;). They cover the EquipQR
            dashboard, the public equipment pages served at links beginning with{" "}
            <code>/e/</code>, and related services (together, the &quot;Service&quot;). They do
            not create any obligation between EquipQR and your customers who scan a QR code or
            submit a service request — that relationship is between you and them.
          </p>

          <h2>2. Accounts</h2>
          <p>
            You must provide accurate information to create an account and are responsible for
            everything that happens under it, including actions taken by team members you
            invite. Notify us promptly at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline-offset-4 hover:underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            if you believe your account has been compromised.
          </p>

          <h2>3. Subscriptions, trials, and billing</h2>
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

          <h2>4. Your content and data</h2>
          <p>
            You retain ownership of the data you and your customers put into the Service,
            including equipment records, customer records, troubleshooting guides, service
            requests, and any photos or video submitted with them (&quot;Customer
            Content&quot;). You grant EquipQR a license to host, process, and display Customer
            Content solely to provide and support the Service, including using it with
            third-party subprocessors described in our{" "}
            <a href="/privacy" className="text-primary underline-offset-4 hover:underline">
              Privacy Policy
            </a>
            . You&apos;re responsible for having the rights and permissions needed to submit
            Customer Content, including any consents required to collect your customers&apos;
            information and media.
          </p>

          <h2>5. Acceptable use</h2>
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

          <h2>6. AI-generated content</h2>
          <p>
            The Service uses AI models to help draft troubleshooting guides, power the
            chat-style assistant on public equipment pages, and summarize service requests. AI
            output can be inaccurate or incomplete. You&apos;re responsible for reviewing
            AI-drafted guides before publishing them, and neither guides nor AI summaries should
            be relied on for situations involving safety risk, electrical, gas, or refrigerant
            hazards, or regulated equipment without independent verification by a qualified
            technician.
          </p>

          <h2>7. Availability and support</h2>
          <p>
            We work to keep the Service available and will give notice of planned maintenance
            where practical, but we don&apos;t guarantee uninterrupted availability. Support
            response targets for your plan are described on our{" "}
            <a href="/pricing" className="text-primary underline-offset-4 hover:underline">
              pricing page
            </a>{" "}
            and are targets, not guarantees.
          </p>

          <h2>8. Termination</h2>
          <p>
            You may stop using the Service and cancel your subscription at any time. We may
            suspend or terminate accounts that violate these Terms, that we reasonably believe
            put the Service or other customers at risk, or for non-payment, with notice where
            practical. Upon termination, we will make reasonable efforts to allow you to export
            your Customer Content for a limited period before deletion, except where prohibited
            by law or where the account was terminated for abuse.
          </p>

          <h2>9. Disclaimers</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available.&quot; To the
            maximum extent permitted by law, EquipQR disclaims all warranties, express or
            implied, including merchantability, fitness for a particular purpose, and
            non-infringement. We do not warrant that troubleshooting guides or AI output will
            resolve any particular equipment issue.
          </p>

          <h2>10. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, EquipQR and its officers, employees, and
            suppliers will not be liable for any indirect, incidental, special, consequential,
            or punitive damages, or for lost profits, revenue, or data, arising out of or
            related to the Service, even if advised of the possibility of such damages. Our
            total liability arising out of or related to these Terms or the Service will not
            exceed the amount you paid us in the twelve months before the claim arose.
          </p>

          <h2>11. Indemnification</h2>
          <p>
            You agree to indemnify and hold EquipQR harmless from claims, damages, and expenses
            (including reasonable attorneys&apos; fees) arising from your Customer Content, your
            use of the Service in violation of these Terms, or your violation of any law or
            third-party right.
          </p>

          <h2>12. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. If we make material changes, we&apos;ll
            provide notice, such as by email or an in-app notice, before they take effect.
            Continued use of the Service after changes take effect constitutes acceptance of the
            updated Terms.
          </p>

          <h2>13. Governing law</h2>
          <p>
            These Terms are governed by the laws of the State of Texas, without regard to its
            conflict-of-laws principles. Any dispute arising out of these Terms or the Service
            will be brought exclusively in the state or federal courts located in Texas, and you
            consent to personal jurisdiction there.
          </p>

          <h2>14. Contact</h2>
          <p>
            Questions about these Terms can be sent to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline-offset-4 hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </LegalContent>

        <LegalNotice />
      </section>
    </>
  );
}
