import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { getCurrentProfile } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/format";
import type { CategoryDefaultVendor, Dispatch, Equipment, EquipmentType, Vendor } from "@/lib/types";
import { EditVendorForm } from "./edit-vendor-form";
import { CategoryDefaultsEditor } from "./category-defaults-editor";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .maybeSingle<Vendor>();

  if (!vendor) {
    notFound();
  }

  const [{ data: equipmentTypes }, { data: categoryDefaults }, { data: units }, { data: dispatches }, { profile, company }] =
    await Promise.all([
      supabase.from("equipment_types").select("*").order("name").returns<EquipmentType[]>(),
      supabase
        .from("category_default_vendors")
        .select("*")
        .eq("vendor_id", id)
        .returns<CategoryDefaultVendor[]>(),
      supabase
        .from("equipment")
        .select("id, name, status")
        .eq("vendor_id", id)
        .order("name")
        .returns<Pick<Equipment, "id" | "name" | "status">[]>(),
      supabase
        .from("dispatches")
        .select("*")
        .eq("vendor_id", id)
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<Dispatch[]>(),
      getCurrentProfile(),
    ]);

  const requestIds = [...new Set((dispatches ?? []).map((d) => d.service_request_id))];
  const { data: requests } =
    requestIds.length > 0
      ? await supabase
          .from("service_requests")
          .select("id, equipment_id")
          .in("id", requestIds)
          .returns<{ id: string; equipment_id: string }[]>()
      : { data: [] as { id: string; equipment_id: string }[] };
  const equipmentIds = [...new Set((requests ?? []).map((r) => r.equipment_id))];
  const { data: requestEquipment } =
    equipmentIds.length > 0
      ? await supabase
          .from("equipment")
          .select("id, name")
          .in("id", equipmentIds)
          .returns<Pick<Equipment, "id" | "name">[]>()
      : { data: [] as Pick<Equipment, "id" | "name">[] };
  const equipmentNameById = new Map((requestEquipment ?? []).map((e) => [e.id, e.name]));
  const equipmentIdByRequest = new Map((requests ?? []).map((r) => [r.id, r.equipment_id]));

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/vendors" label="Back to vendors" />
        <h1 className="text-2xl font-semibold">{vendor.name}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <EditVendorForm vendor={vendor} canDelete={profile.role === "owner"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent dispatches</CardTitle>
            </CardHeader>
            <CardContent>
              {!dispatches || dispatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No work orders sent to this vendor yet.</p>
              ) : (
                <ul className="divide-y">
                  {dispatches.map((dispatch) => {
                    const equipmentId = equipmentIdByRequest.get(dispatch.service_request_id);
                    const equipmentName = equipmentId ? equipmentNameById.get(equipmentId) : undefined;
                    return (
                      <li key={dispatch.id}>
                        <Link
                          href={`/dashboard/requests/${dispatch.service_request_id}`}
                          className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-foreground"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{equipmentName ?? "Unknown equipment"}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(dispatch.created_at)}
                            </p>
                          </div>
                          <DispatchStatusBadge
                            status={dispatch.status}
                            vendorName={vendor.name}
                            etaAt={dispatch.eta_at}
                            timeZone={company.timezone}
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Category defaults</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryDefaultsEditor
                vendorId={vendor.id}
                equipmentTypes={equipmentTypes ?? []}
                defaultTypeIds={(categoryDefaults ?? []).map((cd) => cd.equipment_type_id)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Units assigned here</CardTitle>
            </CardHeader>
            <CardContent>
              {!units || units.length === 0 ? (
                <p className="text-sm text-muted-foreground">No equipment assigned to this vendor directly.</p>
              ) : (
                <ul className="divide-y">
                  {units.map((unit) => (
                    <li key={unit.id}>
                      <Link
                        href={`/dashboard/equipment/${unit.id}`}
                        className="block py-2 text-sm font-medium hover:underline"
                      >
                        {unit.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
