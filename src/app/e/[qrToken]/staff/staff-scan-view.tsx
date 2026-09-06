import type { EquipmentGuide, UserRole } from "@/lib/types";

// PLACEHOLDER — workstream A (staff scan mode + close-out) replaces this
// file. Keep the export name and props; page.tsx already routes staff here.

export type ScanningStaff = { userId: string; role: UserRole; fullName: string };

export function StaffScanView({
  guide,
  qrToken,
  staff,
}: {
  guide: EquipmentGuide;
  qrToken: string;
  staff: ScanningStaff;
}) {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-3 px-4 py-8">
      <h1 className="text-2xl font-semibold">{guide.equipment.name}</h1>
      <p className="text-muted-foreground">
        Staff view for {staff.fullName} — coming soon. <a className="underline" href={`/e/${qrToken}?view=customer`}>View customer page</a>
      </p>
    </div>
  );
}
