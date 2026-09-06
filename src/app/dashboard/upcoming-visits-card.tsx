import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OPEN_REQUEST_STATUSES } from "@/components/status-badge";
import { formatZonedDateTime } from "@/lib/scheduling";
import type { Customer, Equipment, ServiceRequest } from "@/lib/types";

const VISIT_LIMIT = 5;

type UpcomingVisitRow = Pick<ServiceRequest, "id" | "equipment_id" | "customer_id" | "contact_name" | "scheduled_for">;

// Kept out of the component body so the impure Date call isn't made during
// render itself (same reasoning as getDateWindows() on the overview page).
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * The overview's "Upcoming visits" card: the next few open requests with a
 * booked visit, in the company's timezone. Self-contained (own client, own
 * profile lookup) so the overview page can mount it without plumbing props.
 */
export async function UpcomingVisitsCard() {
  const supabase = await createClient();
  const { company } = await getCurrentProfile();

  const { data: visits } = await supabase
    .from("service_requests")
    .select("id, equipment_id, customer_id, contact_name, scheduled_for")
    .in("status", OPEN_REQUEST_STATUSES)
    .gte("scheduled_for", nowIso())
    .order("scheduled_for", { ascending: true })
    .limit(VISIT_LIMIT)
    .returns<UpcomingVisitRow[]>();

  const rows = (visits ?? []).filter((v): v is UpcomingVisitRow & { scheduled_for: string } => !!v.scheduled_for);

  const equipmentIds = [...new Set(rows.map((r) => r.equipment_id))];
  const customerIds = [...new Set(rows.flatMap((r) => (r.customer_id ? [r.customer_id] : [])))];

  const [{ data: equipment }, { data: customers }] = await Promise.all([
    equipmentIds.length > 0
      ? supabase.from("equipment").select("id, name").in("id", equipmentIds).returns<Pick<Equipment, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Equipment, "id" | "name">[] }),
    customerIds.length > 0
      ? supabase.from("customers").select("id, name").in("id", customerIds).returns<Pick<Customer, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Customer, "id" | "name">[] }),
  ]);

  const equipmentNameById = new Map((equipment ?? []).map((e) => [e.id, e.name]));
  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <CalendarClock className="size-4 text-muted-foreground" />
          Upcoming visits
        </CardTitle>
        <CardAction>
          <Link href="/dashboard/requests?status=scheduled" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <ul className="divide-y">
            {rows.map((visit) => {
              const customerName = visit.customer_id ? customerNameById.get(visit.customer_id) : null;
              return (
                <li key={visit.id}>
                  <Link
                    href={`/dashboard/requests/${visit.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-foreground"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {equipmentNameById.get(visit.equipment_id) ?? "Unknown equipment"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {customerName ?? visit.contact_name}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatZonedDateTime(visit.scheduled_for, company.timezone)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No visits scheduled.</p>
        )}
      </CardContent>
    </Card>
  );
}
