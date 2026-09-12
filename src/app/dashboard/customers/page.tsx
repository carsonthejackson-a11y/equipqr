import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { NewCustomerDialog } from "./new-customer-dialog";
import type { Customer } from "@/lib/types";

export default async function CustomersPage() {
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

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .order("name")
    .returns<Customer[]>();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-muted-foreground">
            Accounts equipment can be tied to, for address and contact info.
          </p>
        </div>
        <NewCustomerDialog />
      </div>

      {!customers || customers.length === 0 ? (
        <EmptyState icon={Users} message="No customers yet. Add one to start linking equipment to it." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
