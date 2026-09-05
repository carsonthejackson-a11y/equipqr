import { BackLink } from "@/components/back-link";
import { OwnerOnlyCard } from "@/components/owner-only-card";
import { requireOwner } from "@/lib/auth";
import { ImportForm } from "./import-form";

export const metadata = {
  title: "Import equipment",
};

export default async function ImportEquipmentPage() {
  // Bulk-creating records (and possibly new types/customers) counts against
  // the plan and reshapes the account — owner territory, like billing.
  const owner = await requireOwner();

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/equipment" label="Back to equipment" />
        <h1 className="text-2xl font-semibold">Import equipment</h1>
        <p className="text-muted-foreground">
          Bring a spreadsheet of existing units across. Every imported unit gets its own QR code,
          ready to print.
        </p>
      </div>

      {owner ? (
        <ImportForm />
      ) : (
        <OwnerOnlyCard message="Only company owners can import equipment. Ask an owner to run the import for you." />
      )}
    </div>
  );
}
