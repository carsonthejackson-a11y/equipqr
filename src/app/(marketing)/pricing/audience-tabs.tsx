"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FaqList } from "../_components/faq-item";
import { billingFaqs, ownerFaqs } from "../_components/faq-data";
import { PricingToggle } from "./pricing-toggle";
import { OwnerPricingCards } from "../_components/owner-pricing-cards";
import { plans, type Plan } from "@/lib/plans";
import { FEATURES } from "@/lib/features";

// docs/OWNER-ROADMAP-BRIEF.md §3.4: /pricing is segmented by audience —
// service companies (the original three plans) vs. restaurants & small
// business (the owner plans). ?for=owners|providers on the URL drives which
// tab is active, defaulting to providers, so /restaurants can deep-link into
// the right one.
type Audience = "providers" | "owners";

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
  ...(FEATURES.batchQr
    ? [
        {
          label: "Pre-printed batch QR sticker orders",
          values: (p: Plan) => <FeatureCell included={p.features.batchQr} />,
        },
      ]
    : []),
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

/** The default ("providers") tab's content — also used as the Suspense fallback in page.tsx, so the initial static render and the hydrated one match exactly with no flash. */
export function ProviderPricingSection() {
  return (
    <div className="space-y-16 sm:space-y-20">
      <PricingToggle />

      <div>
        <h2 className="text-center font-heading text-2xl font-semibold tracking-tight">
          Compare plans
        </h2>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-border bg-card">
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

      <div>
        <h2 className="text-center font-heading text-2xl font-semibold tracking-tight">
          Billing questions
        </h2>
        <FaqList items={billingFaqs} className="mx-auto mt-10 max-w-3xl" />
      </div>
    </div>
  );
}

function OwnerPricingSection() {
  return (
    <div className="space-y-16 sm:space-y-20">
      <div>
        <p className="mx-auto max-w-xl text-center text-muted-foreground">
          Every plan includes unlimited staff and vendor contacts. Start on Free and upgrade
          whenever you outgrow it — you&apos;re never locked out for staying put.
        </p>
        <OwnerPricingCards className="mt-10" />
      </div>

      <div>
        <h2 className="text-center font-heading text-2xl font-semibold tracking-tight">
          Questions from restaurants & small business
        </h2>
        <FaqList items={ownerFaqs} className="mx-auto mt-10 max-w-3xl" />
      </div>
    </div>
  );
}

export function AudienceTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const audience: Audience = searchParams.get("for") === "owners" ? "owners" : "providers";

  const setAudience = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "owners") {
        params.set("for", "owners");
      } else {
        params.delete("for");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <Tabs value={audience} onValueChange={(value) => setAudience(String(value))}>
      <TabsList className="mx-auto mb-14 h-auto flex-wrap justify-center gap-1 p-1">
        <TabsTrigger value="providers" className="px-4 py-2">
          For service companies
        </TabsTrigger>
        <TabsTrigger value="owners" className="px-4 py-2">
          For restaurants &amp; small business
        </TabsTrigger>
      </TabsList>

      <TabsContent value="providers">
        <ProviderPricingSection />
      </TabsContent>
      <TabsContent value="owners">
        <OwnerPricingSection />
      </TabsContent>
    </Tabs>
  );
}
