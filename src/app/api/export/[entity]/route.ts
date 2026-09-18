import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { csvFilename, toCsv, type CsvColumn } from "@/lib/csv-export";
import { formatCustomFieldValue } from "@/lib/custom-fields";
import { formatShortCode } from "@/lib/qr";
import { isExportEntity } from "@/app/dashboard/settings/api/export-entities";
import type {
  Customer,
  Equipment,
  EquipmentCustomField,
  EquipmentType,
  Profile,
  QrCode,
  ScanEvent,
  ServiceRequest,
} from "@/lib/types";

// Session-authenticated CSV export, restricted to owners — the same
// restriction as the Settings > API page that links here (dashboard/settings/api/page.tsx),
// now enforced server-side too rather than only by hiding the button, since
// a non-owner who found or bookmarked this URL directly could otherwise
// still download the company's data (C1-38). Gated by the Business
// "exportApi" feature the same way as the v1 API, since it's the same sold
// capability ("Data export & API access").

export async function GET(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;

  if (!isExportEntity(entity)) {
    return NextResponse.json({ error: "Unknown export entity" }, { status: 404 });
  }

  const ctx = await requireOwner();
  if (!ctx) {
    return NextResponse.json({ error: "Only company owners can export data." }, { status: 403 });
  }
  const { company } = ctx;

  const entitlements = await getEntitlements();
  if (!hasFeature(entitlements, "exportApi")) {
    return NextResponse.json(
      { error: "Data export is available on the Business plan. Upgrade on the Billing page." },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  let csv: string;

  // Every exporter reads through fetchAll(), which throws on a query error —
  // a failed page must become a 500, never a truncated file with a 200.
  try {
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
  } catch (err) {
    const error = err instanceof Error ? err.message : "Export failed";
    console.error(`export/${entity} failed for company ${company.id}:`, error);
    return NextResponse.json({ error }, { status: 500 });
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

// Every query below goes through fetchAll() with an `id` tiebreak on its
// order: an un-ranged select silently stops at PostgREST's max-rows (1000),
// so a company with more units/customers/codes than that used to get a
// truncated CSV with a 200. The `id, name` lookups are company-scoped
// (rather than `.in("id", <every id on the page>)`) because a thousand-uuid
// `in` list overflows the query string.

async function exportEquipment(supabase: SupabaseServerClient, companyId: string): Promise<string> {
  const [equipment, types, customers, codes, customFields] = await Promise.all([
    fetchAll<Equipment>((from, to) =>
      supabase
        .from("equipment")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .returns<Equipment[]>()
    ),
    fetchAll<EquipmentType>((from, to) =>
      supabase.from("equipment_types").select("*").eq("company_id", companyId).order("id").range(from, to).returns<EquipmentType[]>()
    ),
    fetchAll<Customer>((from, to) =>
      supabase.from("customers").select("*").eq("company_id", companyId).order("id").range(from, to).returns<Customer[]>()
    ),
    fetchAll<QrCode>((from, to) =>
      supabase
        .from("qr_codes")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("id")
        .range(from, to)
        .returns<QrCode[]>()
    ),
    fetchAll<EquipmentCustomField>((from, to) =>
      supabase
        .from("equipment_custom_fields")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to)
        .returns<EquipmentCustomField[]>()
    ),
  ]);

  const typeById = new Map(types.map((t) => [t.id, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const codeByEquipmentId = new Map(codes.filter((c) => c.equipment_id).map((c) => [c.equipment_id as string, c]));

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
    // One column per custom field definition, headed by its label, in the
    // owner's order. Values render the way the detail page shows them
    // (booleans as Yes/No); a unit without a value gets an empty cell.
    ...customFieldColumns(customFields),
    { header: "created_at", value: (r) => r.created_at },
    { header: "updated_at", value: (r) => r.updated_at },
  ];

  return toCsv(equipment, columns);
}

/** Core equipment export headers, as the import normalises them (lower-case, spaces → underscores). */
const EQUIPMENT_EXPORT_CORE_HEADERS = new Set([
  "id", "name", "type", "equipment_type", "customer", "qr_short_code", "status", "make", "model",
  "serial_number", "location", "address", "contact_name", "contact_phone", "install_date",
  "warranty_ends_on", "last_serviced_at", "next_service_due_on", "notes", "created_at", "updated_at",
]);

/**
 * A field labelled "Status" or "Notes" would otherwise produce a second
 * column with the same header as a core one — ambiguous in a spreadsheet and
 * silently dropped by the import. Such fields (and any two labels that
 * normalise to the same header) fall back to the unambiguous `cf:<key>`
 * form, which the import accepts as well.
 */
function customFieldColumns(defs: EquipmentCustomField[]): CsvColumn<Equipment>[] {
  const used = new Set(EQUIPMENT_EXPORT_CORE_HEADERS);
  return defs.map((def) => {
    const normalized = def.label.trim().toLowerCase().replace(/\s+/g, "_");
    const header = used.has(normalized) ? `cf:${def.key}` : def.label;
    used.add(normalized);
    return {
      header,
      value: (r) => formatCustomFieldValue(def, r.custom_fields?.[def.key]),
    };
  });
}

async function exportCustomers(supabase: SupabaseServerClient, companyId: string): Promise<string> {
  const customers = await fetchAll<Customer>((from, to) =>
    supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
      .returns<Customer[]>()
  );

  const columns: CsvColumn<Customer>[] = [
    { header: "id", value: (r) => r.id },
    { header: "name", value: (r) => r.name },
    { header: "address", value: (r) => r.address },
    { header: "contact_name", value: (r) => r.contact_name },
    { header: "contact_email", value: (r) => r.contact_email },
    { header: "contact_phone", value: (r) => r.contact_phone },
    { header: "created_at", value: (r) => r.created_at },
  ];

  return toCsv(customers, columns);
}

/** Every `id, name` pair of a company-scoped table, for resolving foreign keys to display names. */
function fetchNames(
  supabase: SupabaseServerClient,
  table: "equipment" | "customers",
  companyId: string
): Promise<{ id: string; name: string }[]> {
  return fetchAll<{ id: string; name: string }>((from, to) =>
    supabase.from(table).select("id, name").eq("company_id", companyId).order("id").range(from, to).returns<{ id: string; name: string }[]>()
  );
}

async function exportServiceRequests(supabase: SupabaseServerClient, companyId: string): Promise<string> {
  const [requests, equipment, customers, assignees] = await Promise.all([
    fetchAll<ServiceRequest>((from, to) =>
      supabase
        .from("service_requests")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .returns<ServiceRequest[]>()
    ),
    fetchNames(supabase, "equipment", companyId),
    fetchNames(supabase, "customers", companyId),
    fetchAll<Pick<Profile, "id" | "full_name">>((from, to) =>
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", companyId)
        .order("id")
        .range(from, to)
        .returns<Pick<Profile, "id" | "full_name">[]>()
    ),
  ]);

  const equipmentById = new Map(equipment.map((e) => [e.id, e.name]));
  const customerById = new Map(customers.map((c) => [c.id, c.name]));
  const assigneeById = new Map(assignees.map((p) => [p.id, p.full_name]));

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

  return toCsv(requests, columns);
}

async function exportScanEvents(supabase: SupabaseServerClient, companyId: string): Promise<string> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [events, equipment] = await Promise.all([
    fetchAll<ScanEvent>((from, to) =>
      supabase
        .from("scan_events")
        .select("*")
        .eq("company_id", companyId)
        .gte("scanned_at", since)
        .order("scanned_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .returns<ScanEvent[]>()
    ),
    fetchNames(supabase, "equipment", companyId),
  ]);
  const equipmentById = new Map(equipment.map((e) => [e.id, e.name]));

  const columns: CsvColumn<ScanEvent>[] = [
    { header: "id", value: (r) => r.id },
    { header: "equipment", value: (r) => (r.equipment_id ? equipmentById.get(r.equipment_id) ?? "" : "") },
    { header: "source", value: (r) => r.source },
    { header: "scanned_at", value: (r) => r.scanned_at },
    { header: "user_agent", value: (r) => r.user_agent },
  ];

  return toCsv(events, columns);
}
