import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CHECKLIST_ITEM_KIND_LABELS } from "@/lib/checklists";
import type { Equipment, Inspection, Profile } from "@/lib/types";

const SIGNED_URL_TTL_SECONDS = 3600;

function ItemStatusIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) return <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />;
  if (passed === false) return <XCircle className="size-5 shrink-0 text-destructive" aria-hidden />;
  return <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />;
}

function formatValue(value: boolean | string | number | null, kind: string, photoCount = 0): string {
  if (kind === "photo") {
    return photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : "No photo";
  }
  if (value === null) return "No response";
  if (kind === "check") return value ? "Checked" : "Not checked";
  if (kind === "pass_fail") return value === "pass" ? "Pass" : value === "fail" ? "Fail" : "No response";
  return String(value);
}

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inspection } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .maybeSingle<Inspection>();

  if (!inspection) {
    notFound();
  }

  const [{ data: equipment }, { data: performer }] = await Promise.all([
    supabase
      .from("equipment")
      .select("*")
      .eq("id", inspection.equipment_id)
      .maybeSingle<Equipment>(),
    inspection.performed_by
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", inspection.performed_by)
          .maybeSingle<Pick<Profile, "id" | "full_name">>()
      : Promise.resolve({ data: null as Pick<Profile, "id" | "full_name"> | null }),
  ]);

  const photoPaths = inspection.items.flatMap((item) => item.response.photo_paths);
  const pathsToSign = [...photoPaths, ...(inspection.signature_path ? [inspection.signature_path] : [])];

  const signedUrlByPath = new Map<string, string>();
  if (pathsToSign.length > 0) {
    const results = await Promise.all(
      pathsToSign.map((path) =>
        supabase.storage.from("equipment-files").createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      )
    );
    pathsToSign.forEach((path, i) => {
      const url = results[i].data?.signedUrl;
      if (url) signedUrlByPath.set(path, url);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/checklists/inspections" label="Back to inspections" />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{inspection.template_name}</h1>
          <Badge variant={inspection.status === "completed" ? "default" : "outline"}>
            {inspection.status === "completed" ? "Completed" : inspection.status === "abandoned" ? "Abandoned" : "In progress"}
          </Badge>
          {inspection.status === "completed" && (
            <Badge variant={inspection.failed_count > 0 ? "destructive" : "outline"}>
              {inspection.failed_count} failed
            </Badge>
          )}
        </div>
        <p className="mt-1 text-muted-foreground">
          {equipment ? (
            <Link href={`/dashboard/equipment/${equipment.id}`} className="underline underline-offset-2 hover:text-foreground">
              {equipment.name}
            </Link>
          ) : (
            "Unknown equipment"
          )}
          {" · "}
          {performer?.full_name || "Staff"}
          {" · "}
          {new Date(inspection.started_at).toLocaleString()}
          {inspection.service_request_id && (
            <>
              {" · "}
              <Link
                href={`/dashboard/requests/${inspection.service_request_id}`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                View linked request
              </Link>
            </>
          )}
        </p>
      </div>

      {inspection.summary && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium text-muted-foreground">Summary</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{inspection.summary}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {inspection.items.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-start gap-2">
                <ItemStatusIcon passed={item.response.passed} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.label}</p>
                    {item.required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {CHECKLIST_ITEM_KIND_LABELS[item.kind]}
                    </span>
                  </div>
                  {item.help && <p className="text-sm text-muted-foreground">{item.help}</p>}
                  <p className="mt-1 text-sm">
                    {formatValue(item.response.value, item.kind, item.response.photo_paths.length)}
                  </p>
                  {item.response.note && (
                    <p className="mt-1 text-sm text-muted-foreground italic">&ldquo;{item.response.note}&rdquo;</p>
                  )}
                </div>
              </div>
              {item.response.photo_paths.length > 0 && (
                <div className="ml-7 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {item.response.photo_paths.map((path) =>
                    signedUrlByPath.get(path) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={path}
                        src={signedUrlByPath.get(path)}
                        alt={`${item.label} photo`}
                        className="aspect-square rounded-md border object-cover"
                      />
                    ) : null
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {(inspection.signature_path || inspection.signed_by_name) && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-medium text-muted-foreground">Sign-off</p>
            <Separator />
            {inspection.signature_path && signedUrlByPath.get(inspection.signature_path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signedUrlByPath.get(inspection.signature_path)}
                alt="Signature"
                className="h-24 w-auto rounded-md border bg-white"
              />
            )}
            <p className="text-sm text-muted-foreground">
              {inspection.signed_by_name ?? "Signed on the technician's device"}
              {inspection.signed_at && ` · ${new Date(inspection.signed_at).toLocaleString()}`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
