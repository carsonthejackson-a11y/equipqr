import Link from "next/link";
import { ClipboardList, MapPin, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatShortCode } from "@/lib/qr";
import { formatRelativeTime } from "@/lib/format";
import { EquipmentStatusBadge, OPEN_REQUEST_STATUSES, StatusBadge } from "@/components/status-badge";
import type { CompanyMember, EquipmentGuide, ServiceRequest, UserRole } from "@/lib/types";
import { StaffRequestCard } from "./staff-request-card";
import { LogVisitCard } from "./log-visit-card";

// Workstream A (staff scan mode + close-out). A technician standing at the
// machine, on their phone: what's open on this unit, and a way to work and
// close out a request without going near the dashboard. Mobile-first, one
// action per screen, camera-first uploads — see NEXT-ROADMAP-BRIEF.md.

/** `fullName` mirrors the nullable `profiles.full_name` column — an invited technician may have none. */
export type ScanningStaff = { userId: string; role: UserRole; fullName: string | null };

const RECENT_HISTORY_LIMIT = 3;

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function StaffScanView({
  guide,
  qrToken,
  staff,
}: {
  guide: EquipmentGuide;
  qrToken: string;
  staff: ScanningStaff;
}) {
  const supabase = await createClient();

  const [{ data: openRequests }, { data: recentResolved }, { data: membersData }] = await Promise.all([
    supabase
      .from("service_requests")
      .select("*")
      .eq("equipment_id", guide.equipment.id)
      .in("status", OPEN_REQUEST_STATUSES)
      .order("created_at", { ascending: false })
      .returns<ServiceRequest[]>(),
    supabase
      .from("service_requests")
      .select("*")
      .eq("equipment_id", guide.equipment.id)
      .eq("status", "resolved")
      .order("resolved_at", { ascending: false })
      .limit(RECENT_HISTORY_LIMIT)
      .returns<ServiceRequest[]>(),
    supabase.rpc("get_company_members"),
  ]);

  const members = (membersData as CompanyMember[] | null) ?? [];
  const nameById = new Map(members.map((m) => [m.id, m.full_name?.trim() || m.email] as const));

  const staffFirstName = (staff.fullName ?? "").trim().split(/\s+/)[0] || "there";
  const makeModel = [guide.equipment.make, guide.equipment.model].filter(Boolean).join(" ");
  const nextServiceDue = formatDate(guide.equipment.next_service_due_on);
  const lastServiced = formatDate(guide.equipment.last_serviced_at);

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-5 px-4 pb-10">
      <header className="flex items-center justify-between gap-3 border-b py-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          Staff · {staffFirstName}
        </span>
        <Link href={`/e/${qrToken}?view=customer`} className="text-sm text-muted-foreground underline underline-offset-2">
          View customer page
        </Link>
      </header>

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl leading-tight font-semibold">{guide.equipment.name}</h1>
            <p className="text-muted-foreground">
              {[guide.equipment_type.name, makeModel].filter(Boolean).join(" · ")}
            </p>
          </div>
          <EquipmentStatusBadge status={guide.equipment.status} />
        </div>

        {guide.equipment.location && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {guide.equipment.location}
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Last serviced {lastServiced ?? "—"}</span>
          <span>Next service due {nextServiceDue ?? "—"}</span>
          <span className="font-mono">{formatShortCode(guide.code.short_code)}</span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open requests</h2>
        {openRequests && openRequests.length > 0 ? (
          <div className="space-y-3">
            {openRequests.map((request) => (
              <StaffRequestCard
                key={request.id}
                qrToken={qrToken}
                request={request}
                companyId={guide.company.id}
                staffUserId={staff.userId}
                assigneeName={request.assigned_to ? (nameById.get(request.assigned_to) ?? null) : null}
              />
            ))}
          </div>
        ) : (
          <LogVisitCard qrToken={qrToken} equipmentId={guide.equipment.id} companyId={guide.company.id} />
        )}
      </section>

      {recentResolved && recentResolved.length > 0 && (
        <details className="rounded-xl border">
          <summary className="min-h-[56px] cursor-pointer list-none px-4 py-3 text-base font-medium marker:content-none">
            Recent history
          </summary>
          <div className="space-y-3 border-t px-4 py-3">
            {recentResolved.map((request) => (
              <div key={request.id} className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={request.status} />
                  <span className="text-muted-foreground">
                    {request.resolved_at ? formatRelativeTime(request.resolved_at) : ""}
                  </span>
                </div>
                {request.resolution_summary && (
                  <p className="line-clamp-2 text-muted-foreground">{request.resolution_summary}</p>
                )}
                <Link
                  href={`/dashboard/requests/${request.id}`}
                  className="inline-block text-primary underline underline-offset-2"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        </details>
      )}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href={`/e/${qrToken}/inspect`}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium"
        >
          <ClipboardList className="size-4" aria-hidden />
          Start inspection
        </Link>
        <Link
          href={`/dashboard/equipment/${guide.equipment.id}`}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium"
        >
          <Pencil className="size-4" aria-hidden />
          Edit equipment
        </Link>
      </section>
    </div>
  );
}
