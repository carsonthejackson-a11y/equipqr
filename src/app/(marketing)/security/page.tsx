import type { Metadata } from "next";
import { ShieldCheck, Lock, Database, CreditCard, Users, Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security",
  description: "How EquipQR isolates tenant data, encrypts it, and keeps payment details out of our systems.",
};

const points = [
  {
    icon: Database,
    title: "Tenant isolation by row-level security",
    description:
      "Every table that holds customer, equipment, or service request data is protected by Postgres row-level security policies scoped to a company ID resolved server-side. One company's data isn't queryable by another — it's enforced at the database layer, not just in application code.",
  },
  {
    icon: Lock,
    title: "Encrypted in transit and at rest",
    description:
      "All traffic to EquipQR is served over TLS. Data at rest — including equipment records, guides, and service request photos and video — is encrypted at rest by our infrastructure provider, Supabase.",
  },
  {
    icon: CreditCard,
    title: "No card data touches our servers",
    description:
      "Subscription payments are handled entirely by Stripe. EquipQR never receives or stores your card number — only a subscription status and a tokenized reference from Stripe.",
  },
  {
    icon: Users,
    title: "Least-privilege team roles",
    description:
      "Owners and technicians have distinct permissions. Technicians can work equipment, customers, and service requests, but can't touch billing, team membership, or company deletion — so a compromised technician account has a limited blast radius.",
  },
  {
    icon: ShieldCheck,
    title: "Public pages expose only what's needed",
    description:
      "The scan pages your customers see are served through access-controlled database functions that return only what's necessary to show a guide or accept a service request — never a broader view into your account.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <section className="border-b border-border/80 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">Security</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            A summary of how EquipQR keeps your data — and your customers&apos; data — isolated
            and protected.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="space-y-8">
          {points.map((p) => (
            <div key={p.title} className="flex gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <p.icon className="size-5" />
              </div>
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">
                  {p.title}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex items-start gap-3 rounded-xl border border-border bg-card p-5">
          <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Found a security issue?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              with details and we&apos;ll respond promptly. Please don&apos;t test against
              other customers&apos; accounts or data.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
