import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { csvFilename, toCsv, type CsvColumn } from "@/lib/csv-export";
import { formatShortCode } from "@/lib/qr";
import { isExportEntity } from "@/app/dashboard/settings/api/export-entities";
import type {
  Customer,
  Equipment,
  EquipmentType,
  Profile,
  QrCode,
  ScanEvent,
  ServiceRequest,
} from "@/lib/types";

// Session-authenticated CSV export for signed-in staff (any role — export is
// read-only, so this doesn't need requireOwner()). Gated by the Business
// "exportApi" feature the same way as the v1 API, since it's the same sold
// capability ("Data export & API access").

export async function GET(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;

  if (!isExportEntity(entity)) {
    return NextResponse.json({ error: "Unknown export entity" }, { status: 404 });
  }

  const { company } = await getCurrentProfile();

  const entitlements = await getEntitlements();
  if (!hasFeature(entitlements, "exportApi")) {
    return NextResponse.json(
      { error: "Data export is available on the Business plan. Upgrade on the Billing page." },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  let csv: string;

  switch (entity) {
    case "equipment":
      csv = await exportEquipment(supabase, company.id);
      break;
    case "customers":
      csv = await exportCustomers(supabase, company.id);
      break;
    case "service-requests":
      csv = await exportServiceRequests(supabase, company.id);
      break;
    case "scan-events":
      csv = await exportScanEvents(supabase, company.id);
      break;
    default:
      return NextResponse.json({ error: "Unknown export entity" }, { status: 404 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(entity)}"`,
      "Cache-Control": "no-store",
    },
  });
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function exportEquipment(supabase: SupabaseServerClient, companyId: string): Promise<string> {
  const [{ data: equipment }, { data: types }, { data: customers }, { data: codes }] = await Promise.all([
    supabase
      .from("equipment")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .returns<Equipment[]>(),
    supabase.from("equipment_types").select("*").eq("company_id", companyId).returns<EquipmentType[]>(),
    supabase.from("customers").select("*").eq("company_id", companyId).returns<Customer[]>(),
    supabase
      .from("qr_codes")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "active")
      .returns<QrCode[]>(),
  ]);

  const typeById = new Map((types ?? []).map((t) => [t.id, t]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const codeByEquipmentId = new Map((codes ?? []).filter((c) => c.equipment_id).map((c) => [c.equipment_id as string, c]));

  type Row = Equipment;
  const columns: CsvColumn<Row>[] = [
    { header: "id", value: (r) => r.id },
    { header: "name", value: (r) => r.name },
    { header: "type", value: (r) => (r.equipment_type_id ? typeById.get(r.equipment_type_id)?.name : "") },
    { header: "customer", value: (r) => (r.customer_id ? customerById.get(r.customer_id)?.name : "") },
    { header: "qr_short_code", value: (r) => {
        const code = codeByEquipmentId.get(r.id);
        return code ? formatShortCode(code.short_code) : "";
      } },
    { header: "status", value: (r) => r.status },
    { header: "make", value: (r) => r.make },
    { header: "model", value: (r) => r.model },
    { header: "serial_number", value: (r) => r.serial_number },
    { header: "location", value: (r) => r.location },
    { header: "address", value: (r) => r.address },
    { header: "contact_name", value: (r) => r.contact_name },
    { header: "contact_phone", value: (r) => r.contact_phone },
    { header: "install_date", value: (r) => r.install_date },
    { header: "warranty_ends_on", value: (r) => r.warranty_ends_on },
    { header: "last_serviced_at", value: (r) => r.last_serviced_at },
    { header: "next_service_due_on", value: (r) => r.next_service_due_on },
    { header: "notes", value: (r) => r.notes },
    { header: "created_at", value: (r) => r.created_at },
    { header: "updated_at", value: (r) => r.updated_at },
  ];

  return toCsv(equipment ?? [], columns);
}

async function exportCustomers(supabase: SupabaseServerClient, companyId: string): Promise<string> {
  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .returns<Customer[]>();

  const columns: CsvColumn<Customer>[] = [
    { header: "id", value: (r) => r.id },
    { header: "name", value: (r) => r.name },
    { header: "address", value: (r) => r.address },
    { header: "contact_name", value: (r) => r.contact_name },
    { header: "contact_email", value: (r) => r.contact_email },
    { header: "contact_phone", value: (r) => r.contact_phone },
    { header: "created_at", value: (r) => r.created_at },
  ];

  return toCsv(customers ?? [], columns);
}

async function exportServiceRequests(supabase: SupabaseServerClient, companyId: string): Promise<string> {
  const { data: requests } = await supabase
    .from("service_requests")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .returns<ServiceRequest[]>();

  const equipmentIds = [...new Set((requests ?? []).map((r) => r.equipment_id))];
  const customerIds = [...new Set((requests ?? []).map((r) => r.customer_id).filter((id): id is string => !!id))];
  const assigneeIds = [...new Set((requests ?? []).map((r) => r.assigned_to).filter((id): id is string => !!id))];

  const [{ data: equipment }, { data: customers }, { data: assignees }] = await Promise.all([
    equipmentIds.length > 0
      ? supabase.from("equipment").select("id, name").in("id", equipmentIds).returns<Pick<Equipment, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Equipment, "id" | "name">[] }),
    customerIds.length > 0
      ? supabase.from("customers").select("id, name").in("id", customerIds).returns<Pick<Customer, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Customer, "id" | "name">[] }),
    assigneeIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", assigneeIds).returns<Pick<Profile, "id" | "full_name">[]>()
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "full_name">[] }),
  ]);

  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e.name]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const assigneeById = new Map((assignees ?? []).map((p) => [p.id, p.full_name]));

  const columns: CsvColumn<ServiceRequest>[] = [
    { header: "id", value: (r) => r.id },
    { header: "equipment", value: (r) => equipmentById.get(r.equipment_id) ?? "" },
    { header: "customer", value: (r) => (r.customer_id ? customerById.get(r.customer_id) ?? "" : "") },
    { header: "assigned_to", value: (r) => (r.assigned_to ? assigneeById.get(r.assigned_to) ?? "" : "") },
    { header: "status", value: (r) => r.status },
    { header: "priority", value: (r) => r.priority },
    { header: "description", value: (r) => r.description },
    { header: "contact_name", value: (r) => r.contact_name },
    { header: "contact_email", value: (r) => r.contact_email },
    { header: "contact_phone", value: (r) => r.contact_phone },
    { header: "scheduled_for", value: (r) => r.scheduled_for },
    { header: "resolution_summary", value: (r) => r.resolution_summary },
    { header: "resolution_recommendations", value: (r) => r.resolution_recommendations },
    { header: "resolved_at", value: (r) => r.resolved_at },
    { header: "status_updated_at", value: (r) => r.status_updated_at },
    { header: "created_at", value: (r) => r.created_at },
    { header: "updated_at", value: (r) => r.updated_at },
  ];

  return toCsv(requests ?? [], columns);
}

async function exportScanEvents(supabase: SupabaseServerClient, companyId: string): Promise<string> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from("scan_events")
    .select("*")
    .eq("company_id", companyId)
    .gte("scanned_at", since)
    .order("scanned_at", { ascending: false })
    .returns<ScanEvent[]>();

  const equipmentIds = [...new Set((events ?? []).map((e) => e.equipment_id).filter((id): id is string => !!id))];
  const { data: equipment } =
    equipmentIds.length > 0
      ? await supabase.from("equipment").select("id, name").in("id", equipmentIds).returns<Pick<Equipment, "id" | "name">[]>()
      : { data: [] as Pick<Equipment, "id" | "name">[] };
  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e.name]));

  const columns: CsvColumn<ScanEvent>[] = [
    { header: "id", value: (r) => r.id },
    { header: "equipment", value: (r) => (r.equipment_id ? equipmentById.get(r.equipment_id) ?? "" : "") },
    { header: "source", value: (r) => r.source },
    { header: "scanned_at", value: (r) => r.scanned_at },
    { header: "user_agent", value: (r) => r.user_agent },
  ];

  return toCsv(events ?? [], columns);
}
