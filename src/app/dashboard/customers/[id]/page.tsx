import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Navigation, Phone, Printer, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/company-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { mapsHref, telHref } from "@/lib/contact-links";
import type { Customer, Equipment, ServiceRequest } from "@/lib/types";
import { EditCustomerForm } from "./edit-customer-form";
import { NewRequestSheet } from "../../requests/new-request-sheet";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getCompanyContext();

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
  const presetUnits = (equipment ?? []).map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BackLink href="/dashboard/customers" label="Back to customers" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Q-38: read-only — editing lives behind EditCustomerForm's own toggle below. */}
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold">{customer.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {customer.address && (
                <a
                  href={mapsHref(customer.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Navigation className="size-3.5" />
                  {customer.address}
                </a>
              )}
              {customer.contact_phone && (
                <a
                  href={telHref(customer.contact_phone)}
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Phone className="size-3.5" />
                  {customer.contact_phone}
                </a>
              )}
              {customer.contact_email && (
                <a
                  href={`mailto:${customer.contact_email}`}
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Mail className="size-3.5" />
                  {customer.contact_email}
                </a>
              )}
              {!customer.address && !customer.contact_phone && !customer.contact_email && (
                <p className="text-muted-foreground">No address or contact details on file.</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {presetUnits.length > 0 && <NewRequestSheet kind={ctx.kind} presetUnits={presetUnits} />}
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/dashboard/equipment?customer=${customer.id}`} />}
            >
              <Wrench className="size-4" />
              Add equipment
            </Button>
            {presetUnits.length > 0 && (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/dashboard/equipment/labels?customer=${customer.id}`} />}
              >
                <Printer className="size-4" />
                Print stickers
              </Button>
            )}
          </div>
        </div>
      </div>

      <EditCustomerForm customer={customer} isOwner={ctx.isOwnerRole} />

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
                    <TableCell>{ctx.fmt.date(req.created_at)}</TableCell>
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
