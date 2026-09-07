import { createClient } from "@/lib/supabase/server";
import type { Company, ServiceRequest } from "@/lib/types";
import { ScheduleVisitForm } from "./schedule-visit-form";

/**
 * Self-contained server component (same pattern as ./qr-section.tsx on the
 * equipment page): fetches the one thing the form needs that isn't already
 * on the request row — the company's timezone — so requests/[id]/page.tsx
 * (workstream B's file) only has to render `<ScheduleVisitCard request={...} />`.
 */
export async function ScheduleVisitCard({ request }: { request: ServiceRequest }) {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", request.company_id)
    .maybeSingle<Pick<Company, "timezone">>();

  return (
    <ScheduleVisitForm
      requestId={request.id}
      scheduledFor={request.scheduled_for}
      durationMinutes={request.scheduled_duration_minutes}
      companyTimezone={company?.timezone ?? "UTC"}
    />
  );
}
