// Shared between the "Data export" section (api/page.tsx) and
// /api/export/[entity]/route.ts, so the button labels and the set of valid
// entities never drift apart.

export const EXPORT_ENTITIES = [
  { value: "equipment", label: "Equipment" },
  { value: "customers", label: "Customers" },
  { value: "service-requests", label: "Service requests" },
  { value: "scan-events", label: "Scan events (last 90 days)" },
] as const;

export type ExportEntity = (typeof EXPORT_ENTITIES)[number]["value"];

export function isExportEntity(value: string): value is ExportEntity {
  return EXPORT_ENTITIES.some((e) => e.value === value);
}
