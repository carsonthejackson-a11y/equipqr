import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeader, LegalContent, LegalNotice } from "../_components/legal";
import { SUPPORT_EMAIL } from "@/lib/site";

const LAST_UPDATED = "September 3, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How EquipQR collects, uses, and protects data.",
};

export default function PrivacyPage() {
  return (
    <>
      <LegalHeader
        title="Privacy Policy"
        description="How we collect, use, and protect data across EquipQR — for the companies that use it and the customers who scan a sticker."
        lastUpdated={LAST_UPDATED}
      />

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <LegalContent>
          <h2>1. Scope</h2>
          <p>
            This policy covers the EquipQR dashboard and the public equipment pages served at
            links beginning with <code>/e/</code>. It applies both to the companies
            (&quot;Customers&quot;) that use EquipQR to manage their equipment and to the
            end-users (&quot;End Users&quot;) who scan a QR code and interact with a
            Customer&apos;s equipment page.
          </p>

          <h2>2. Information we collect</h2>
          <p>From Customers and their team members, we collect:</p>
          <ul>
            <li>Account information: name, email address, and authentication credentials;</li>
            <li>
              Company data you enter: company name, notification email, customer records,
              equipment records, and troubleshooting guides;
            </li>
            <li>
              Billing information, handled directly by our payment processor (Stripe) — we
              receive a subscription status and reference token, not your full card number; and
            </li>
            <li>
              Usage data such as pages visited and actions taken in the dashboard, used to
              operate and improve the Service.
            </li>
          </ul>
          <p>From End Users who scan a QR code or submit a service request, we collect:</p>
          <ul>
            <li>
              Troubleshooting responses: the answers selected while working through a guide, and
              any question typed into the chat-style assistant;
            </li>
            <li>
              Service request details: a description of the issue, contact name, email and/or
              phone number, and any photos or video attached; and
            </li>
            <li>Basic technical data such as IP address and browser type, for security and abuse prevention.</li>
          </ul>
          <p>
            We do not require End Users to create an account, and we do not knowingly collect
            more information from them than is needed to route a service request to the
            Customer they&apos;re contacting.
          </p>

          <h2>3. How we use information</h2>
          <ul>
            <li>To provide the Service: operate accounts, guides, equipment pages, and service requests;</li>
            <li>
              To power AI features: drafting troubleshooting guides, answering questions in the
              chat assistant, and summarizing service requests for the Customer that receives
              them;
            </li>
            <li>To send transactional email, such as new service request notifications and account emails;</li>
            <li>To process payments and manage subscriptions;</li>
            <li>To secure the Service, prevent abuse, and enforce our Terms of Service; and</li>
            <li>To comply with legal obligations.</li>
          </ul>

          <h2>4. Subprocessors</h2>
          <p>
            We use a small number of subprocessors to run EquipQR, each bound by contract to
            protect data they process on our behalf and to use it only to provide their service
            to us:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> — database, authentication, and file storage (including
              service request photos and video);
            </li>
            <li>
              <strong>Stripe</strong> — payment processing and subscription billing;
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery (e.g. service request and
              account notifications); and
            </li>
            <li>
              <strong>Anthropic</strong> — AI model provider used to draft troubleshooting
              guides, power the chat assistant, and summarize service requests.
            </li>
          </ul>
          <p>
            We don&apos;t sell personal information, and we don&apos;t share Customer Content
            with third parties except the subprocessors above, at a Customer&apos;s direction,
            or where required by law.
          </p>

          <h2>5. Data retention</h2>
          <p>
            We retain account and Customer Content for as long as the account is active, plus a
            limited period after cancellation to allow data export, unless a shorter period is
            requested or a longer period is required by law. End User data submitted through a
            service request is retained as part of that Customer&apos;s records and is subject
            to that Customer&apos;s own retention practices.
          </p>

          <h2>6. Security</h2>
          <p>
            Data is encrypted in transit (TLS) and at rest, and access to Customer data within
            our database is enforced by row-level security scoped to each company — one
            Customer&apos;s data is not queryable by another. More detail is on our{" "}
            <Link href="/security" className="text-primary underline-offset-4 hover:underline">
              Security page
            </Link>
            .
          </p>

          <h2>7. Your choices and rights</h2>
          <p>
            Customers can access, correct, export, or delete data they&apos;ve entered from
            within the dashboard, or by contacting us. End Users who want to access, correct, or
            delete information they submitted through a service request should contact the
            Customer they submitted it to, since that Customer controls the record; we&apos;ll
            assist Customers with such requests. Depending on where you live, you may have
            additional rights under applicable law (for example, the right to request a copy of
            your data or to object to certain processing) — contact us and we&apos;ll respond.
          </p>

          <h2>8. Children&apos;s privacy</h2>
          <p>
            EquipQR is a business tool and is not directed at children. We do not knowingly
            collect personal information from children under 13.
          </p>

          <h2>9. International data</h2>
          <p>
            Our infrastructure and subprocessors may store and process data in the United
            States. By using the Service, you consent to this transfer and processing.
          </p>

          <h2>10. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will be announced, for
            example by email or an in-app notice, before they take effect.
          </p>

          <h2>11. Contact</h2>
          <p>
            Questions about this policy or a privacy request can be sent to{" "}
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
