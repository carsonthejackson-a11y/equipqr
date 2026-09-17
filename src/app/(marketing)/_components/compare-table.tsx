import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FEATURES } from "@/lib/features";
import type { BillingInterval, Plan, PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { CheckIcon, XIcon } from "./icon";
import { formatPrice } from "./plan-card";

// README "Table" + §3 "Compare". Used by Pricing (per audience, per interval)
// and the Features "Plans" matrix. A row's `value` returns a node, or a
// boolean that renders the accent check / neutral X with an aria-label.

export type CompareRow = {
  label: string;
  value: (plan: Plan) => React.ReactNode | boolean;
};

const included = (plan: Plan) => plan.features;

const batchQrRow: CompareRow[] = FEATURES.batchQr
  ? [{ label: "Blank QR code batches to print yourself", value: (p) => included(p).batchQr }]
  : [];

/** Service-company plans (Starter / Pro / Business). */
export const providerCompareRows: CompareRow[] = [
  { label: "Equipment units", value: (p) => p.equipmentLimit.toLocaleString("en-US") },
  { label: "Team members", value: (p) => (p.memberLimit === null ? "Unlimited" : p.memberLimit) },
  { label: "AI-drafted troubleshooting guides", value: () => true },
  { label: "Service requests with photo & video", value: () => true },
  { label: "Chat-style AI troubleshooting assistant", value: (p) => included(p).aiChat },
  ...batchQrRow,
  { label: "Your logo & colors on customer pages", value: (p) => included(p).branding },
  { label: "Data export & API access", value: (p) => included(p).exportApi },
  { label: "Support", value: (p) => p.supportLabel.replace(/ support$/, "") },
];

/** Restaurant / kitchen plans (Free / Kitchen / Multi-kitchen). */
export const ownerCompareRows: CompareRow[] = [
  { label: "Equipment units", value: (p) => p.equipmentLimit.toLocaleString("en-US") },
  { label: "Locations", value: (p) => (p.locationLimit === null ? "Unlimited" : p.locationLimit) },
  { label: "Staff and vendor contacts", value: () => "Unlimited" },
  { label: "Work orders with photo & video", value: () => true },
  { label: "AI-drafted troubleshooting guides", value: (p) => included(p).aiChat },
  { label: "Chat-style AI troubleshooting assistant", value: (p) => included(p).aiChat },
  ...batchQrRow,
  { label: "Your logo & colors on customer pages", value: (p) => included(p).branding },
  { label: "Support", value: (p) => p.supportLabel.replace(/ support$/, "") },
];

/**
 * Baseline workflow every plan in both audiences actually ships (Q-63): the compare table used to
 * jump straight to the rows that differ, which under-sold what even the cheapest plan includes.
 * Real features only — nothing here is plan-gated in src/lib/plans.ts.
 */
export const ALWAYS_INCLUDED_ROWS: readonly string[] = [
  "Scheduling and reminders",
  "PM schedules",
  "Checklists and inspections",
  "Phone close-out with photos and signature",
  "Customer status page and messages",
];

export type CompareTableProps = {
  plans: readonly Plan[];
  rows: readonly CompareRow[];
  /** First header cell, e.g. "Monthly, billed monthly". */
  firstHeader: React.ReactNode;
  /** Drives the price sub-label under each plan name. */
  interval: BillingInterval;
  /** Plan column rendered in accent. Defaults to the `popular` plan. */
  highlightedPlanId?: PlanId;
  /** Feature names included on every plan, rendered as a labelled ✓✓✓ group above `rows` (Q-63). */
  alwaysIncluded?: readonly string[];
  className?: string;
};

function priceLabel(plan: Plan, interval: BillingInterval): string {
  if (plan.priceMonthly === 0) return formatPrice(0);
  return interval === "month" ? `${formatPrice(plan.priceMonthly)}/mo` : `${formatPrice(plan.priceYearly)}/yr`;
}

function Mark({ included }: { included: boolean }) {
  return included ? (
    <CheckIcon size={18} className="inline-block align-middle text-primary" aria-label="Included" />
  ) : (
    <XIcon size={18} className="inline-block align-middle text-eq-neutral-700" aria-label="Not included" />
  );
}

export function CompareTable({
  plans,
  rows,
  firstHeader,
  interval,
  highlightedPlanId = plans.find((p) => p.popular)?.id,
  alwaysIncluded,
  className,
}: CompareTableProps) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-eq-neutral-900", className)}>
      <Table className="w-full min-w-[640px] text-[14px]">
        <TableHeader>
          <TableRow className="border-eq-neutral-900 hover:bg-transparent">
            <TableHead className="h-auto w-[40%] px-5 py-[14px] text-left text-[12px] font-normal whitespace-normal text-eq-neutral-500">
              {firstHeader}
            </TableHead>
            {plans.map((plan) => (
              <TableHead key={plan.id} className="h-auto p-3 text-center font-normal">
                <div className={cn("text-[14px]", plan.id === highlightedPlanId ? "text-primary" : "text-eq-text")}>
                  {plan.name}
                </div>
                <div className="mt-[2px] text-[12px] text-eq-neutral-500 tabular-nums">{priceLabel(plan, interval)}</div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {alwaysIncluded && alwaysIncluded.length > 0 && (
            <>
              <TableRow className="border-eq-neutral-900 bg-foreground/[0.03] hover:bg-foreground/[0.03]">
                <TableCell
                  colSpan={plans.length + 1}
                  className="px-5 py-[9px] text-[11px] font-medium tracking-[0.06em] text-eq-neutral-500 uppercase"
                >
                  Included in every plan
                </TableCell>
              </TableRow>
              {alwaysIncluded.map((label) => (
                <TableRow key={label} className="border-eq-neutral-900 hover:bg-foreground/[0.04]">
                  <TableCell className="px-5 py-3 font-medium whitespace-normal">{label}</TableCell>
                  {plans.map((plan) => (
                    <TableCell key={plan.id} className="p-3 text-center text-eq-neutral-300 tabular-nums">
                      <Mark included />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </>
          )}
          {rows.map((row) => (
            <TableRow key={row.label} className="border-eq-neutral-900 hover:bg-foreground/[0.04]">
              <TableCell className="px-5 py-3 font-medium whitespace-normal">{row.label}</TableCell>
              {plans.map((plan) => {
                const value = row.value(plan);
                return (
                  <TableCell key={plan.id} className="p-3 text-center text-eq-neutral-300 tabular-nums">
                    {typeof value === "boolean" ? <Mark included={value} /> : value}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
