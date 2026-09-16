import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCompanyDate } from "@/lib/format";
import { daysBetween, earliestByCompany } from "@/lib/activation";
import type { Company } from "@/lib/types";

// Rows beyond this many (per source table, earliest-first) aren't considered
// when looking for a company's *first* milestone — a generous safety cap
// against a runaway query on this ops page, not a real limit at today's
// scale. If it's ever hit for a given table, the affected milestone reads
// "—" instead of its true (very early) date rather than showing a wrong one.
const ROW_CAP = 5000;

/** "Sep 16, 2026 (+3d)" / "day 0" relative to signup, or "—" before it's happened. */
function renderMilestone(signedUpAt: string, at: string | undefined) {
  if (!at) return <span className="text-muted-foreground">—</span>;
  const offset = daysBetween(signedUpAt, at);
  return (
    <span>
      {formatCompanyDate(at, "UTC", { year: "always" })}
      {offset !== null && (
        <span className="text-muted-foreground"> ({offset <= 0 ? "day 0" : `+${offset}d`})</span>
      )}
    </span>
  );
}

/**
 * Per-company activation funnel (docs/QOL-CONTINUITY-BRIEF.md item 12):
 * signed up -> first unit -> first label printed -> first scan -> first
 * scan-originated request. Gated by AdminLayout's is_platform_admin() check
 * above this, same as every other /admin page.
 */
export default async function AdminPage() {
  const supabase = await createClient();

  // companies and qr_codes both carry an explicit platform-admin RLS policy
  // ("Platform admins view all companies" / "...manage all qr codes" —
  // supabase/migrations/0004_qr_code_pool.sql), so the caller's own
  // authenticated session already sees every company through them — no
  // service-role client needed for either.
  const [{ data: companies }, { data: printedCodes }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, kind, created_at")
      .order("created_at", { ascending: false })
      .returns<Pick<Company, "id" | "name" | "kind" | "created_at">[]>(),
    supabase
      .from("qr_codes")
      .select("company_id, label_printed_at")
      .not("label_printed_at", "is", null)
      .order("label_printed_at", { ascending: true })
      .limit(ROW_CAP)
      .returns<{ company_id: string; label_printed_at: string }[]>(),
  ]);

  // equipment, scan_events and service_requests only have "own company" RLS
  // (no platform-admin policy), so reading across every company for this
  // table needs the service-role client — and unlike STRIPE_SECRET_KEY,
  // SUPABASE_SERVICE_ROLE_KEY is optional in src/lib/env.ts, so this degrades
  // (same isXConfigured() pattern as src/lib/stripe.ts) instead of throwing
  // when it's unset, e.g. in a dev environment.
  const serviceRoleConfigured = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  let firstUnitRows: { company_id: string; created_at: string }[] = [];
  let scanRows: { company_id: string; scanned_at: string }[] = [];
  let scanRequestRows: { company_id: string; created_at: string }[] = [];

  if (serviceRoleConfigured) {
    // Read-only, three fixed aggregate queries, on a page already gated to
    // is_platform_admin() above this.
    const admin = createAdminClient();
    const [{ data: units }, { data: scans }, { data: requests }] = await Promise.all([
      admin
        .from("equipment")
        .select("company_id, created_at")
        .order("created_at", { ascending: true })
        .limit(ROW_CAP)
        .returns<{ company_id: string; created_at: string }[]>(),
      admin
        .from("scan_events")
        .select("company_id, scanned_at")
        .order("scanned_at", { ascending: true })
        .limit(ROW_CAP)
        .returns<{ company_id: string; scanned_at: string }[]>(),
      admin
        .from("service_requests")
        .select("company_id, created_at")
        .eq("source", "scan")
        .order("created_at", { ascending: true })
        .limit(ROW_CAP)
        .returns<{ company_id: string; created_at: string }[]>(),
    ]);
    firstUnitRows = units ?? [];
    scanRows = scans ?? [];
    scanRequestRows = requests ?? [];
  }

  const firstUnitByCompany = earliestByCompany(
    firstUnitRows.map((r) => ({ company_id: r.company_id, at: r.created_at }))
  );
  const firstLabelByCompany = earliestByCompany(
    (printedCodes ?? []).map((r) => ({ company_id: r.company_id, at: r.label_printed_at }))
  );
  const firstScanByCompany = earliestByCompany(
    scanRows.map((r) => ({ company_id: r.company_id, at: r.scanned_at }))
  );
  const firstScanRequestByCompany = earliestByCompany(
    scanRequestRows.map((r) => ({ company_id: r.company_id, at: r.created_at }))
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Activation</h1>
          <p className="text-muted-foreground">
            Every company from signup to its first scan-originated request. Dates are UTC; the
            offset is days after that company signed up.
          </p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href="/admin/qr-codes" />}>
          QR code batches
        </Button>
      </div>

      {!serviceRoleConfigured && (
        <Alert>
          <AlertTitle>SUPABASE_SERVICE_ROLE_KEY not configured</AlertTitle>
          <AlertDescription>
            First unit, first scan and first scan-originated request need it to read across
            every company — showing signup and first label printed only until it&apos;s set.
          </AlertDescription>
        </Alert>
      )}

      {!companies || companies.length === 0 ? (
        <p className="text-muted-foreground">No companies yet.</p>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead>First unit</TableHead>
                <TableHead>First label printed</TableHead>
                <TableHead>First scan</TableHead>
                <TableHead>First scan-originated request</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/qr-codes?company=${company.id}`} className="hover:underline">
                      {company.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {company.kind === "equipment_owner" ? "Owner" : "Provider"}
                    </div>
                  </TableCell>
                  <TableCell>{formatCompanyDate(company.created_at, "UTC", { year: "always" })}</TableCell>
                  <TableCell>
                    {renderMilestone(company.created_at, firstUnitByCompany.get(company.id))}
                  </TableCell>
                  <TableCell>
                    {renderMilestone(company.created_at, firstLabelByCompany.get(company.id))}
                  </TableCell>
                  <TableCell>
                    {renderMilestone(company.created_at, firstScanByCompany.get(company.id))}
                  </TableCell>
                  <TableCell>
                    {renderMilestone(company.created_at, firstScanRequestByCompany.get(company.id))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
