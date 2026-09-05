import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { EquipmentStatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentProfile } from "@/lib/auth";
import type { Customer, Equipment, EquipmentType } from "@/lib/types";
import { EditEquipmentForm } from "./edit-equipment-form";
import { PhotoUploader } from "./photo-uploader";
import { Documents } from "./documents";
import { Timeline } from "./timeline";
import { QrSection } from "./qr-section";

/** One "Make · Model" style line, skipping the bits that aren't filled in. */
function joinMeta(parts: (string | null | undefined)[]): string | null {
  const kept = parts.filter((part): part is string => !!part && part.trim() !== "");
  return kept.length > 0 ? kept.join(" · ") : null;
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", id)
    .maybeSingle<Equipment>();

  if (!equipment) {
    notFound();
  }

  const [{ data: equipmentTypes }, { data: customers }, { profile }] = await Promise.all([
    supabase.from("equipment_types").select("*").returns<EquipmentType[]>(),
    supabase.from("customers").select("*").order("name").returns<Customer[]>(),
    getCurrentProfile(),
  ]);

  const isOwner = profile.role === "owner";
  const equipmentType = (equipmentTypes ?? []).find((t) => t.id === equipment.equipment_type_id);
  const customer = equipment.customer_id
    ? (customers ?? []).find((c) => c.id === equipment.customer_id)
    : undefined;
  const makeModel = joinMeta([equipment.make, equipment.model]);

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/equipment" label="Back to equipment" />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{equipment.name}</h1>
          <EquipmentStatusBadge status={equipment.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span>{equipmentType?.name ?? "Unknown type"}</span>
          {customer && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/dashboard/customers/${customer.id}`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {customer.name}
              </Link>
            </>
          )}
          {makeModel && (
            <>
              <span aria-hidden>·</span>
              <span>{makeModel}</span>
            </>
          )}
          {equipment.serial_number && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono text-sm">S/N {equipment.serial_number}</span>
            </>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Tabs defaultValue="details" className="min-w-0">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="photo">Photo</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="history">Service history</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="pt-4">
            <EditEquipmentForm
              equipment={equipment}
              equipmentTypes={equipmentTypes ?? []}
              customers={customers ?? []}
              canDelete={isOwner}
            />
          </TabsContent>

          <TabsContent value="photo" className="pt-4">
            <PhotoUploader
              equipmentId={equipment.id}
              companyId={equipment.company_id}
              photoPath={equipment.photo_path}
              equipmentName={equipment.name}
            />
          </TabsContent>

          <TabsContent value="documents" className="pt-4">
            <Documents
              equipmentId={equipment.id}
              companyId={equipment.company_id}
              currentUserId={profile.id}
              isOwner={isOwner}
            />
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            <Timeline equipmentId={equipment.id} />
          </TabsContent>
        </Tabs>

        <QrSection equipment={equipment} />
      </div>
    </div>
  );
}
