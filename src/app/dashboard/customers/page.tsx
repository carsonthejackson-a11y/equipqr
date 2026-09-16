import Link from "next/link";
import { Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { OPEN_REQUEST_STATUSES } from "@/components/status-badge";
import { NewCustomerDialog } from "./new-customer-dialog";
import type { Customer } from "@/lib/types";

// PostgREST's `.or()` filter string uses "," to separate clauses and "()" for
// lists — wrapping a value in double quotes lets it contain either literally
// (same escaping as requests/page.tsx's search, duplicated locally since
// it's two lines and this page doesn't otherwise share code with that one).
function escapeOrValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const supabase = await createClient();
  const { company } = await getCurrentProfile();

  // Owner-kind companies work through vendors, not customers — the route
  // stays live (docs/OWNER-ROADMAP-BRIEF.md §3.2 explicitly says not to
  // delete it) but points staff at /dashboard/vendors instead.
  if (company.kind === "equipment_owner") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-muted-foreground">Not used on this account.</p>
        </div>
        <EmptyState
          icon={Users}
          message="Your account works with vendors instead of customers. Manage them from Vendors."
          action={<Button render={<Link href="/dashboard/vendors" />}>Go to Vendors</Button>}
        />
      </div>
    );
  }

  let customerQuery = supabase.from("customers").select("*").order("name");
  if (q) {
    const escaped = escapeOrValue(`%${q}%`);
    customerQuery = customerQuery.or(
      `name.ilike.${escaped},contact_name.ilike.${escaped},address.ilike.${escaped}`
    );
  }
  const { data: customers } = await customerQuery.returns<Customer[]>();

  // Q-39: "Units" / "Open" columns — bulk-counted company-wide (cheap at
  // this app's scale, same tradeoff maintenance/page.tsx already makes)
  // rather than a per-row query per customer.
  const [{ data: allEquipment }, { data: openRequests }] = await Promise.all([
    supabase.from("equipment").select("id, customer_id").not("customer_id", "is", null),
    supabase
      .from("service_requests")
      .select("id, customer_id")
      .in("status", OPEN_REQUEST_STATUSES)
      .not("customer_id", "is", null),
  ]);

  const unitCountByCustomer = new Map<string, number>();
  for (const row of allEquipment ?? []) {
    if (!row.customer_id) continue;
    unitCountByCustomer.set(row.customer_id, (unitCountByCustomer.get(row.customer_id) ?? 0) + 1);
  }
  const openCountByCustomer = new Map<string, number>();
  for (const row of openRequests ?? []) {
    if (!row.customer_id) continue;
    openCountByCustomer.set(row.customer_id, (openCountByCustomer.get(row.customer_id) ?? 0) + 1);
  }

  const hasCustomers = !!customers && customers.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-muted-foreground">
            Accounts equipment can be tied to, for address and contact info.
          </p>
        </div>
        <NewCustomerDialog />
      </div>

      <form className="max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search customers…"
            className="pl-8"
            aria-label="Search customers"
          />
        </div>
      </form>

      {!hasCustomers ? (
        <EmptyState
          icon={Users}
          message={
            q
              ? `No customers match "${q}".`
              : "No customers yet. Add one to start linking equipment to it."
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => {
                const units = unitCountByCustomer.get(customer.id) ?? 0;
                const open = openCountByCustomer.get(customer.id) ?? 0;
                return (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className="font-medium hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{customer.address ?? "—"}</TableCell>
                    <TableCell>{customer.contact_name ?? "—"}</TableCell>
                    <TableCell>{units || "—"}</TableCell>
                    <TableCell>
                      {open > 0 ? (
                        <Badge className="border border-primary/20 bg-primary/15 text-primary">{open}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
