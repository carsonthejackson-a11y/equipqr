import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ResolvedQrCode } from "@/lib/types";
import { ServiceRequestForm } from "./service-request-form";

export default async function ServiceRequestPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("resolve_qr_code", { p_token: qrToken });
  const resolved = data as ResolvedQrCode;

  if (!resolved || resolved.status !== "claimed") {
    notFound();
  }

  const { guide } = resolved;

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col px-4 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{guide.company.name}</p>
        <h1 className="text-xl font-semibold">Request service for {guide.equipment.name}</h1>
        <p className="text-sm text-muted-foreground">
          Add a description and any photos or videos that show the problem.
        </p>
      </div>

      <ServiceRequestForm qrToken={qrToken} />
    </div>
  );
}
