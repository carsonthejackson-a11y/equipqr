import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FEATURES } from "@/lib/features";
import { ownerPlans, plans, type Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";
import type { CompareRow } from "../_components/compare-table";
import { CheckIcon, XIcon } from "../_components/icon";
import { formatPrice } from "../_components/plan-card";

// Features "Plans" matrix (Features.dc.html #plans): ONE table with both
// audiences side by side, a grouped header row ("Service companies" /
// "Restaurants & kitchens"), a 1px neutral-900 rule before each group and
// the monthly price under every plan name. The row set is the design's, not
// the Pricing compare rows (labels differ and both audiences share one list);
// values still come from plans.ts so names and limits never drift. The
// batch-sticker row is gated on FEATURES.batchQr like the Pricing table
// (BRIEF §3.5).

const groups: { label: string; plans: readonly Plan[] }[] = [
  { label: "Service companies", plans },
  { label: "Restaurants & kitchens", plans: ownerPlans },
];

const unlimited = (n: number | null) => (n === null ? "Unlimited" : n);

const batchRow: CompareRow[] = FEATURES.batchQr
  ? [{ label: "Pre-printed sticker batches", value: (p) => p.features.batchQr }]
  : [];

const rows: CompareRow[] = [
  { label: "Equipment units", value: (p) => p.equipmentLimit.toLocaleString("en-US") },
  { label: "Team members", value: (p) => unlimited(p.memberLimit) },
  { label: "Locations", value: (p) => unlimited(p.locationLimit) },
  { label: "Service requests with photo & video", value: () => true },
  // Every service-company plan ships guides; restaurant plans get them with the assistant.
  { label: "AI-drafted troubleshooting guides", value: (p) => p.kind === "service_provider" || p.features.aiChat },
  { label: "Chat-style AI assistant", value: (p) => p.features.aiChat },
  ...batchRow,
  { label: "Your logo & colors on customer pages", value: (p) => p.features.branding },
  { label: "Data export & API access", value: (p) => p.features.exportApi },
  { label: "Support", value: (p) => p.supportLabel.replace(/ support$/, "") },
];

const groupRule = "border-l border-eq-neutral-900";

function Mark({ included }: { included: boolean }) {
  return included ? (
    <CheckIcon size={18} className="inline-block align-middle text-primary" aria-label="Included" />
  ) : (
    <XIcon size={18} className="inline-block align-middle text-eq-neutral-700" aria-label="Not included" />
  );
}

export function PlansMatrix({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-eq-neutral-900", className)}>
      <Table className="w-full min-w-[820px] text-[14px]">
        <TableHeader>
          <TableRow className="border-eq-neutral-900 hover:bg-transparent">
            <TableHead className="h-auto w-[28%] px-5 py-[14px]" />
            {groups.map((group) => (
              <TableHead
                key={group.label}
                colSpan={group.plans.length}
                className={cn("h-auto px-3 py-[14px] text-center text-[14px] font-normal text-primary", groupRule)}
              >
                {group.label}
              </TableHead>
            ))}
          </TableRow>
          <TableRow className="border-eq-neutral-900 hover:bg-transparent">
            <TableHead className="h-auto px-5 py-3 text-left text-[12px] font-normal whitespace-normal text-eq-neutral-500">
              Monthly, billed monthly
            </TableHead>
            {groups.map((group) =>
              group.plans.map((plan, i) => (
                <TableHead key={plan.id} className={cn("h-auto p-3 text-center font-normal", i === 0 && groupRule)}>
                  <div className="text-[14px] text-eq-text">{plan.name}</div>
                  <div className="mt-[2px] text-[12px] text-eq-neutral-500 tabular-nums">{formatPrice(plan.priceMonthly)}</div>
                </TableHead>
              ))
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label} className="border-eq-neutral-900 hover:bg-foreground/[0.04]">
              <TableCell className="px-5 py-3 font-medium whitespace-normal">{row.label}</TableCell>
              {groups.map((group) =>
                group.plans.map((plan, i) => {
                  const value = row.value(plan);
                  return (
                    <TableCell
                      key={plan.id}
                      className={cn("p-3 text-center text-eq-neutral-300 tabular-nums", i === 0 && groupRule)}
                    >
                      {typeof value === "boolean" ? <Mark included={value} /> : value}
                    </TableCell>
                  );
                })
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
