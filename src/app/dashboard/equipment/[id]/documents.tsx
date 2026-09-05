import { Download, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatBytes } from "@/lib/format";
import type { EquipmentDocument, Profile } from "@/lib/types";
import { DeleteDocumentButton, DocumentUploader } from "./document-uploader";

/**
 * Manuals, invoices and warranty paperwork for one unit. The files live in
 * the PRIVATE `equipment-files` bucket, so nothing here links straight at
 * storage — "Download" goes through ./documents/[docId]/route.ts, which mints
 * a short-lived signed URL with the caller's own RLS-scoped client.
 */
export async function Documents({
  equipmentId,
  companyId,
  currentUserId,
  isOwner,
}: {
  equipmentId: string;
  companyId: string;
  currentUserId: string | null;
  isOwner: boolean;
}) {
  const supabase = await createClient();

  const { data: documents } = await supabase
    .from("equipment_documents")
    .select("*")
    .eq("equipment_id", equipmentId)
    .order("created_at", { ascending: false })
    .returns<EquipmentDocument[]>();

  const uploaderIds = [
    ...new Set((documents ?? []).map((doc) => doc.uploaded_by).filter((id): id is string => !!id)),
  ];

  const { data: uploaders } =
    uploaderIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", uploaderIds)
          .returns<Pick<Profile, "id" | "full_name">[]>()
      : { data: [] as Pick<Profile, "id" | "full_name">[] };

  const nameById = new Map((uploaders ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="space-y-4">
      <DocumentUploader equipmentId={equipmentId} companyId={companyId} />

      {!documents || documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          message="No documents yet. Upload the manual, warranty or last invoice so it's with the unit, not in a filing cabinet."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.file_name}</TableCell>
                  <TableCell className="text-muted-foreground">{formatBytes(doc.size_bytes)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {doc.uploaded_by ? nameById.get(doc.uploaded_by) ?? "Staff" : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {/* A plain <a>, not <Link>: the route redirects to a signed
                          storage URL, which client-side navigation can't follow. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={
                          <a href={`/dashboard/equipment/${equipmentId}/documents/${doc.id}`} />
                        }
                      >
                        <Download className="size-4" />
                        Download
                      </Button>
                      {(isOwner || doc.uploaded_by === currentUserId) && (
                        <DeleteDocumentButton documentId={doc.id} fileName={doc.file_name} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
