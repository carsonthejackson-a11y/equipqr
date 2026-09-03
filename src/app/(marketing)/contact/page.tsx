import type { Metadata } from "next";
import { Mail, Clock } from "lucide-react";
import { ContactForm } from "./contact-form";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the EquipQR team.",
};

// Whether the form (vs. the mailto fallback) renders depends on server env
// vars — evaluate that per-request rather than baking one build's env into
// a statically prerendered page.
export const dynamic = "force-dynamic";

export default function ContactPage() {
  const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Get in touch</h1>
        <p className="mt-3 text-muted-foreground">
          Questions about pricing or setting up your first guide — we read every message.
        </p>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Email us directly</p>
              <p className="text-sm text-muted-foreground">{SUPPORT_EMAIL}</p>
            </div>
          </a>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Response time</p>
              <p className="text-sm text-muted-foreground">
                Usually within one business day. Pro and Business plans get priority support.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          {emailConfigured ? (
            <ContactForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              The contact form isn’t wired up on this environment yet — email us directly at{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              and we’ll get back to you.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
