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
import { StatusBadge, OPEN_REQUEST_STATUSES } from "@/components/status-badge";
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
  const [{ data: requests }, { data: openRequests }] = await Promise.all([
    equipmentIds.length > 0
      ? supabase
          .from("service_requests")
          .select("*")
          .in("equipment_id", equipmentIds)
          .order("created_at", { ascending: false })
          .returns<ServiceRequest[]>()
      : Promise.resolve({ data: [] as ServiceRequest[] }),
    // Requests carry customer_id directly (denormalised at submit time), so
    // this still finds them even if the equipment has since moved customers.
    supabase
      .from("service_requests")
      .select("*")
      .eq("customer_id", id)
      .in("status", OPEN_REQUEST_STATUSES)
      .order("created_at", { ascending: false })
      .returns<ServiceRequest[]>(),
  ]);

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
        <h2 className="text-lg font-semibold">Open requests</h2>
        {!openRequests || openRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open requests for this customer.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {openRequests.map((req) => (
              <Link key={req.id} href={`/dashboard/requests/${req.id}`}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="space-y-1 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">
                        {equipmentById.get(req.equipment_id)?.name ?? "Unknown equipment"}
                      </p>
                      <StatusBadge status={req.status} />
                    </div>
                    <p className="line-clamp-1 text-sm text-muted-foreground">{req.description}</p>
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
