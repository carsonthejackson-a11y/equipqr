import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FaqList } from "../_components/faq-item";
import { billingFaqs } from "../_components/faq-data";
import { PricingToggle } from "./pricing-toggle";
import { plans, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for field-service teams. No overage charges — every plan starts with a 14-day free trial.",
};

function FeatureCell({ included }: { included: boolean }) {
  return included ? (
    <Check className="mx-auto size-4 text-primary" aria-label="Included" />
  ) : (
    <X className="mx-auto size-4 text-muted-foreground/40" aria-label="Not included" />
  );
}

const compareRows: {
  label: string;
  values: (plan: (typeof plans)[number]) => React.ReactNode;
}[] = [
  {
    label: "Equipment units",
    values: (p) => p.equipmentLimit.toLocaleString(),
  },
  {
    label: "Team members",
    values: (p) => (p.memberLimit === null ? "Unlimited" : p.memberLimit),
  },
  {
    label: "AI-drafted troubleshooting guides",
    values: () => <FeatureCell included />,
  },
  {
    label: "Service requests with photo & video",
    values: () => <FeatureCell included />,
  },
  {
    label: "Chat-style AI troubleshooting assistant",
    values: (p) => <FeatureCell included={p.features.aiChat} />,
  },
  {
    label: "Pre-printed batch QR sticker orders",
    values: (p) => <FeatureCell included={p.features.batchQr} />,
  },
  {
    label: "Custom branding on customer pages",
    values: (p) => <FeatureCell included={p.features.branding} />,
  },
  {
    label: "Data export & API access",
    values: (p) => <FeatureCell included={p.features.exportApi} />,
  },
  {
    label: "Support",
    values: (p) => p.supportLabel,
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-border/80 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Pricing that scales with your route
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Every plan includes a {TRIAL_DAYS}-day free trial with full Pro features unlocked.
            No credit card required, and no overage fees when you hit a limit — just an
            upgrade prompt.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <PricingToggle />
      </section>

      <section className="border-t border-border/80 bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-center font-heading text-2xl font-semibold tracking-tight">
            Compare plans
          </h2>
          <div className="mt-10 rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Plan</TableHead>
                  {plans.map((p) => (
                    <TableHead key={p.id} className="text-center">
                      {p.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {compareRows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="whitespace-normal font-medium text-foreground">
                      {row.label}
                    </TableCell>
                    {plans.map((p) => (
                      <TableCell key={p.id} className="text-center text-muted-foreground">
                        {row.values(p)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-center font-heading text-2xl font-semibold tracking-tight">
          Billing questions
        </h2>
        <FaqList items={billingFaqs} className="mt-10" />
      </section>
    </>
  );
}
