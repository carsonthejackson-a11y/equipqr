import Link from "next/link";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { Equipment, RequestStatus, ServiceRequest } from "@/lib/types";

const filters: { label: string; value: RequestStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "In progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = (status ?? "all") as RequestStatus | "all";

  const supabase = await createClient();

  let query = supabase
    .from("service_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }

  const { data: requests } = await query.returns<ServiceRequest[]>();

  const equipmentIds = [...new Set((requests ?? []).map((r) => r.equipment_id))];
  const { data: equipment } =
    equipmentIds.length > 0
      ? await supabase
          .from("equipment")
          .select("*")
          .in("id", equipmentIds)
          .returns<Equipment[]>()
      : { data: [] as Equipment[] };

  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Service requests</h1>
        <p className="text-muted-foreground">Requests submitted by customers via QR code.</p>
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/dashboard/requests" : `/dashboard/requests?status=${f.value}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              activeStatus === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {!requests || requests.length === 0 ? (
        <EmptyState icon={Inbox} message="No requests here yet." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <Link href={`/dashboard/requests/${req.id}`} className="font-medium hover:underline">
                      {equipmentById.get(req.equipment_id)?.name ?? "Unknown equipment"}
                    </Link>
                  </TableCell>
                  <TableCell>{req.contact_name}</TableCell>
                  <TableCell>{new Date(req.created_at).toLocaleString()}</TableCell>
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
  );
}
