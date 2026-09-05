import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  FileMinus,
  FilePlus,
  History,
  Image as ImageIcon,
  Inbox,
  MessageSquare,
  Pencil,
  PlusCircle,
  QrCode,
  ShieldAlert,
  Upload,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { formatRelativeTime } from "@/lib/format";
import { equipmentEventLabel } from "@/lib/events";
import type { EquipmentEvent, Profile } from "@/lib/types";
import { TimelineForms } from "./timeline-forms";

/** How far back the timeline reads. Older rows stay in the table for exports/API. */
const EVENT_LIMIT = 100;

const eventIcons: Record<string, LucideIcon> = {
  equipment_created: PlusCircle,
  equipment_updated: Pencil,
  status_changed: ShieldAlert,
  note: MessageSquare,
  photo_added: ImageIcon,
  document_added: FilePlus,
  document_removed: FileMinus,
  code_assigned: QrCode,
  code_replaced: QrCode,
  code_retired: QrCode,
  code_reassigned: QrCode,
  request_submitted: Inbox,
  request_resolved: ClipboardCheck,
  visit_scheduled: CalendarClock,
  visit_completed: CalendarCheck,
  inspection_completed: ClipboardCheck,
  pm_due: Wrench,
  imported: Upload,
};

function actorLabel(event: EquipmentEvent, staffNames: Map<string, string | null>): string {
  if (event.actor_kind === "customer") return "Customer";
  if (event.actor_kind === "system") return "System";
  if (event.actor_user_id) {
    return staffNames.get(event.actor_user_id) || "Staff";
  }
  return "Staff";
}

/**
 * The unit's service history: every equipment_events row, newest first.
 * Append-only by design (there is no update/delete policy on the table), so
 * this is an audit trail as much as a feed.
 */
export async function Timeline({ equipmentId }: { equipmentId: string }) {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("equipment_events")
    .select("*")
    .eq("equipment_id", equipmentId)
    .order("occurred_at", { ascending: false })
    .limit(EVENT_LIMIT)
    .returns<EquipmentEvent[]>();

  const actorIds = [
    ...new Set(
      (events ?? [])
        .filter((event) => event.actor_kind === "staff" && event.actor_user_id)
        .map((event) => event.actor_user_id as string)
    ),
  ];

  const { data: profiles } =
    actorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds)
          .returns<Pick<Profile, "id" | "full_name">[]>()
      : { data: [] as Pick<Profile, "id" | "full_name">[] };

  const staffNames = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="space-y-4">
      <TimelineForms equipmentId={equipmentId} />

      {!events || events.length === 0 ? (
        <EmptyState icon={History} message="Nothing has happened to this unit yet." />
      ) : (
        <ol className="space-y-0">
          {events.map((event, index) => {
            const Icon = eventIcons[event.kind] ?? History;
            const isLast = index === events.length - 1;

            return (
              <li key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  {!isLast && <span className="w-px flex-1 bg-border" aria-hidden />}
                </div>

                <div className={isLast ? "pb-1" : "pb-6"}>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {equipmentEventLabel(event.kind)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{event.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <time dateTime={event.occurred_at} title={new Date(event.occurred_at).toLocaleString()}>
                      {formatRelativeTime(event.occurred_at)}
                    </time>
                    {" · "}
                    {actorLabel(event, staffNames)}
                    {event.service_request_id && (
                      <>
                        {" · "}
                        <Link
                          href={`/dashboard/requests/${event.service_request_id}`}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          View request
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
