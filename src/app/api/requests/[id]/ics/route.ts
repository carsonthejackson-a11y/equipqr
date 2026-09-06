import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildIcsEvent } from "@/lib/ics";
import { getRequestStatusUrl } from "@/lib/qr";
import type { Company, Equipment, ServiceRequest } from "@/lib/types";

/**
 * `.ics` download for a scheduled visit — staff-only, RLS-scoped (the
 * server client, not the admin client: this is a normal signed-in-staff
 * read, not a cron/webhook). 404s rather than redirecting to /login so a
 * calendar app following the link gets a clean failure instead of an HTML
 * login page saved as "visit.ics".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: request } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<ServiceRequest>();

  if (!request || !request.scheduled_for) {
    return NextResponse.json({ error: "No scheduled visit for this request" }, { status: 404 });
  }

  const [{ data: equipment }, { data: company }] = await Promise.all([
    supabase.from("equipment").select("*").eq("id", request.equipment_id).maybeSingle<Equipment>(),
    supabase.from("companies").select("*").eq("id", request.company_id).maybeSingle<Company>(),
  ]);

  const equipmentName = equipment?.name ?? "Equipment";
  const locationParts = [equipment?.location, equipment?.address].filter(Boolean) as string[];

  const ics = buildIcsEvent({
    uid: `visit-${request.id}@equipqr.app`,
    title: `Visit: ${equipmentName}`,
    description: [
      request.description,
      company?.name ? `Customer: ${company.name}` : null,
      `Contact: ${request.contact_name}${request.contact_phone ? ` · ${request.contact_phone}` : ""}`,
      getRequestStatusUrl(request.public_token),
    ]
      .filter(Boolean)
      .join("\n\n"),
    location: locationParts.length > 0 ? locationParts.join(", ") : null,
    startIso: request.scheduled_for,
    durationMinutes: request.scheduled_duration_minutes,
    url: getRequestStatusUrl(request.public_token),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="visit-${request.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
