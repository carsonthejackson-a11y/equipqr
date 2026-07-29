import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { BackLink } from "@/components/back-link";
import type { Customer, Equipment, ServiceRequest } from "@/lib/types";
import { EditCustomerForm } from "./edit-customer-form";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle<Customer>();

  if (!customer) {
    notFound();
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("customer_id", id)
    .order("name")
    .returns<Equipment[]>();

  const equipmentIds = (equipment ?? []).map((e) => e.id);
  const { data: requests } =
    equipmentIds.length > 0
      ? await supabase
          .from("service_requests")
          .select("*")
          .in("equipment_id", equipmentIds)
          .order("created_at", { ascending: false })
          .returns<ServiceRequest[]>()
      : { data: [] as ServiceRequest[] };

  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e]));

  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/dashboard/customers" label="Back to customers" />
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <p className="text-muted-foreground">Customer details and linked equipment.</p>
      </div>

      <EditCustomerForm customer={customer} />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Equipment</h2>
        {!equipment || equipment.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No equipment linked to this customer yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((item) => (
              <Link key={item.id} href={`/dashboard/equipment/${item.id}`}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="py-4">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.location ?? "No location set"}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Service request history</h2>
        {!requests || requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No service requests for this customer&apos;s equipment yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/requests/${req.id}`}
                        className="font-medium hover:underline"
                      >
                        {equipmentById.get(req.equipment_id)?.name ?? "Unknown equipment"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {req.description}
                    </TableCell>
                    <TableCell>{new Date(req.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={req.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
