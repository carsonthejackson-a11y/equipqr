"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { assertCanAddEquipment, getEntitlements, planFor } from "@/lib/billing";
import { emitEquipmentEvent } from "@/lib/events";
import { createInstantCode } from "@/lib/qr-codes";
import { EQUIPMENT_IMPORT_COLUMNS, parseCsvTable } from "@/lib/csv";
import { normalizeDateInput, parseEquipmentStatus, type EquipmentPatch } from "@/lib/equipment";
import type { Customer, EquipmentType } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Rows per insert round-trip. Keeps a 1,000-row file to 20 statements without a giant payload. */
const BATCH_SIZE = 50;

/** Hard cap on one upload, so a pasted-together file can't blow the action's memory. */
const MAX_ROWS = 2000;

export type ImportRowPreview = {
  /** 1-based row number as the user sees it in their spreadsheet (header is row 1). */
  line: number;
  name: string;
  equipmentType: string;
  customer: string;
  make: string;
  model: string;
  serialNumber: string;
  location: string;
  status: string;
  installDate: string;
  warrantyEndsOn: string;
  /** Why this row can't be imported. Empty means it's good to go. */
  errors: string[];
  /** True when importing this row also creates the type/customer it names. */
  createsType: boolean;
  createsCustomer: boolean;
};

export type ImportPreview = {
  rows: ImportRowPreview[];
  validCount: number;
  errorCount: number;
  /** Distinct new equipment type / customer names the file introduces. */
  newTypes: string[];
  newCustomers: string[];
  /** A problem with the file or the plan that blocks the whole import. */
  fatal: string | null;
};

type Lookups = {
  typesByName: Map<string, EquipmentType>;
  customersByName: Map<string, Customer>;
};

function key(value: string): string {
  return value.trim().toLowerCase();
}

async function loadLookups(supabase: Supabase): Promise<Lookups> {
  const [{ data: types }, { data: customers }] = await Promise.all([
    supabase.from("equipment_types").select("*").returns<EquipmentType[]>(),
    supabase.from("customers").select("*").returns<Customer[]>(),
  ]);

  return {
    typesByName: new Map((types ?? []).map((type) => [key(type.name), type])),
    customersByName: new Map((customers ?? []).map((customer) => [key(customer.name), customer])),
  };
}

type ParsedRow = {
  preview: ImportRowPreview;
  /** Everything but equipment_type_id / customer_id, which are resolved at insert time. */
  patch: Omit<EquipmentPatch, "equipment_type_id" | "customer_id">;
  typeName: string;
  customerName: string;
};

/**
 * Turns the uploaded CSV into per-row previews with validation. Unknown
 * equipment types and customers are errors unless `createMissing` is on, in
 * which case the row is flagged as "will create ...".
 */
function analyze(csvText: string, createMissing: boolean, lookups: Lookups): {
  rows: ParsedRow[];
  fatal: string | null;
} {
  const table = parseCsvTable(csvText);

  if (table.rows.length === 0) {
    return { rows: [], fatal: "That file has no data rows." };
  }
  if (table.rows.length > MAX_ROWS) {
    return {
      rows: [],
      fatal: `That file has ${table.rows.length} rows. Import at most ${MAX_ROWS} at a time.`,
    };
  }
  if (!table.headers.includes("name") || !table.headers.includes("equipment_type")) {
    return {
      rows: [],
      fatal: `The header row needs at least "name" and "equipment_type". Expected columns: ${EQUIPMENT_IMPORT_COLUMNS.join(", ")}.`,
    };
  }

  // Names created earlier in the same file count as existing for later rows.
  const pendingTypes = new Set<string>();
  const pendingCustomers = new Set<string>();
  const seenNames = new Set<string>();

  const rows = table.rows.map((record, index) => {
    const errors: string[] = [];

    const name = (record.name ?? "").trim();
    const typeName = (record.equipment_type ?? "").trim();
    const customerName = (record.customer ?? "").trim();

    if (!name) errors.push("Name is required");
    if (!typeName) errors.push("Equipment type is required");

    if (name) {
      const nameKey = key(name);
      if (seenNames.has(nameKey)) {
        errors.push("Duplicate name in this file");
      }
      seenNames.add(nameKey);
    }

    let createsType = false;
    if (typeName && !lookups.typesByName.has(key(typeName))) {
      if (createMissing) {
        createsType = !pendingTypes.has(key(typeName));
        pendingTypes.add(key(typeName));
      } else {
        errors.push(`Unknown equipment type "${typeName}"`);
      }
    }

    let createsCustomer = false;
    if (customerName && !lookups.customersByName.has(key(customerName))) {
      if (createMissing) {
        createsCustomer = !pendingCustomers.has(key(customerName));
        pendingCustomers.add(key(customerName));
      } else {
        errors.push(`Unknown customer "${customerName}"`);
      }
    }

    const status = parseEquipmentStatus(record.status ?? "");
    if (status === null) {
      errors.push(`Unknown status "${(record.status ?? "").trim()}"`);
    }

    const installDate = normalizeDateInput(record.install_date ?? "");
    if (!installDate.ok) errors.push("Install date must be YYYY-MM-DD");

    const warranty = normalizeDateInput(record.warranty_ends_on ?? "");
    if (!warranty.ok) errors.push("Warranty end date must be YYYY-MM-DD");

    const trimmedOrNull = (value: string | undefined) => (value ?? "").trim() || null;

    return {
      preview: {
        line: index + 2, // +1 for the header row, +1 because spreadsheets are 1-based
        name,
        equipmentType: typeName,
        customer: customerName,
        make: (record.make ?? "").trim(),
        model: (record.model ?? "").trim(),
        serialNumber: (record.serial_number ?? "").trim(),
        location: (record.location ?? "").trim(),
        status: status ?? (record.status ?? "").trim(),
        installDate: installDate.ok ? installDate.value ?? "" : (record.install_date ?? "").trim(),
        warrantyEndsOn: warranty.ok ? warranty.value ?? "" : (record.warranty_ends_on ?? "").trim(),
        errors,
        createsType,
        createsCustomer,
      },
      patch: {
        name,
        make: trimmedOrNull(record.make),
        model: trimmedOrNull(record.model),
        serial_number: trimmedOrNull(record.serial_number),
        location: trimmedOrNull(record.location),
        address: trimmedOrNull(record.address),
        contact_name: trimmedOrNull(record.contact_name),
        contact_phone: trimmedOrNull(record.contact_phone),
        install_date: installDate.ok ? installDate.value : null,
        warranty_ends_on: warranty.ok ? warranty.value : null,
        status: status ?? "active",
        notes: trimmedOrNull(record.notes),
      },
      typeName,
      customerName,
    };
  });

  return { rows, fatal: null };
}

/** Blocks the import when the file would push the company past its plan's unit limit. */
async function assertRoomFor(rowCount: number): Promise<string | null> {
  const blocked = await assertCanAddEquipment();
  if (blocked) return blocked.error;

  const entitlements = await getEntitlements();
  if (!entitlements) return null; // entitlements unknown — fail open, same as everywhere else

  const plan = planFor(entitlements);
  const after = entitlements.equipment_count + rowCount;
  if (after > plan.equipmentLimit) {
    const room = Math.max(0, plan.equipmentLimit - entitlements.equipment_count);
    return `Importing ${rowCount} units would put you at ${after}, over the ${plan.equipmentLimit}-unit limit of the ${plan.name} plan. You have room for ${room} more — upgrade or trim the file.`;
  }
  return null;
}

function summarize(rows: ParsedRow[], fatal: string | null): ImportPreview {
  const previews = rows.map((row) => row.preview);
  return {
    rows: previews,
    validCount: previews.filter((row) => row.errors.length === 0).length,
    errorCount: previews.filter((row) => row.errors.length > 0).length,
    newTypes: [...new Set(previews.filter((r) => r.createsType).map((r) => r.equipmentType))],
    newCustomers: [...new Set(previews.filter((r) => r.createsCustomer).map((r) => r.customer))],
    fatal,
  };
}

export async function previewEquipmentImport(
  csvText: string,
  createMissing: boolean
): Promise<ImportPreview | { error: string }> {
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can import equipment." };
  }

  const supabase = await createClient();
  const lookups = await loadLookups(supabase);
  const { rows, fatal } = analyze(csvText, createMissing, lookups);

  if (fatal) {
    return summarize([], fatal);
  }

  const importable = rows.filter((row) => row.preview.errors.length === 0).length;
  // Check the plan up front, before the user commits to anything.
  const limitError = importable > 0 ? await assertRoomFor(importable) : null;

  return summarize(rows, limitError);
}

export type ImportResult = {
  created: number;
  skipped: number;
  codeErrors: number;
  newTypes: number;
  newCustomers: number;
};

export async function runEquipmentImport(
  csvText: string,
  createMissing: boolean
): Promise<ImportResult | { error: string }> {
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can import equipment." };
  }

  const supabase = await createClient();
  const companyId = owner.company.id;
  const lookups = await loadLookups(supabase);
  const { rows, fatal } = analyze(csvText, createMissing, lookups);

  if (fatal) {
    return { error: fatal };
  }

  const importable = rows.filter((row) => row.preview.errors.length === 0);
  if (importable.length === 0) {
    return { error: "Nothing to import — every row has a problem." };
  }

  // Re-check the limit here, not just at preview time: another session (or
  // another tab) may have added units in between.
  const limitError = await assertRoomFor(importable.length);
  if (limitError) {
    return { error: limitError };
  }

  let newTypes = 0;
  let newCustomers = 0;

  if (createMissing) {
    const missingTypes = [
      ...new Map(
        importable
          .filter((row) => row.typeName && !lookups.typesByName.has(key(row.typeName)))
          .map((row) => [key(row.typeName), row.typeName])
      ).values(),
    ];
    if (missingTypes.length > 0) {
      const { data, error } = await supabase
        .from("equipment_types")
        .insert(missingTypes.map((name) => ({ company_id: companyId, name })))
        .select("*")
        .returns<EquipmentType[]>();
      if (error) return { error: `Couldn't create equipment types: ${error.message}` };
      (data ?? []).forEach((type) => lookups.typesByName.set(key(type.name), type));
      newTypes = data?.length ?? 0;
    }

    const missingCustomers = [
      ...new Map(
        importable
          .filter((row) => row.customerName && !lookups.customersByName.has(key(row.customerName)))
          .map((row) => [key(row.customerName), row.customerName])
      ).values(),
    ];
    if (missingCustomers.length > 0) {
      const { data, error } = await supabase
        .from("customers")
        .insert(missingCustomers.map((name) => ({ company_id: companyId, name })))
        .select("*")
        .returns<Customer[]>();
      if (error) return { error: `Couldn't create customers: ${error.message}` };
      (data ?? []).forEach((customer) => lookups.customersByName.set(key(customer.name), customer));
      newCustomers = data?.length ?? 0;
    }
  }

  let created = 0;
  let codeErrors = 0;

  for (let offset = 0; offset < importable.length; offset += BATCH_SIZE) {
    const batch = importable.slice(offset, offset + BATCH_SIZE);

    const payload = batch.map((row) => ({
      company_id: companyId,
      equipment_type_id: lookups.typesByName.get(key(row.typeName))?.id ?? null,
      customer_id: row.customerName
        ? lookups.customersByName.get(key(row.customerName))?.id ?? null
        : null,
      ...row.patch,
    }));

    // A type that still isn't resolvable here means the row shouldn't have
    // passed validation; drop it rather than violate the NOT NULL constraint.
    const insertable = payload.filter((row) => row.equipment_type_id !== null);
    if (insertable.length === 0) continue;

    const { data, error } = await supabase
      .from("equipment")
      .insert(insertable)
      .select("id, name, company_id")
      .returns<{ id: string; name: string; company_id: string }[]>();

    if (error) {
      return created > 0
        ? {
            error: `Imported ${created} units, then stopped at row ${batch[0].preview.line}: ${error.message}`,
          }
        : { error: error.message };
    }

    const inserted = data ?? [];
    created += inserted.length;

    // Every imported unit gets a printable QR code immediately — that's the
    // whole point of "import then print labels".
    for (const unit of inserted) {
      const codeError = await createInstantCode(supabase, unit.id, companyId);
      if (codeError) codeErrors += 1;

      await emitEquipmentEvent(supabase, {
        companyId,
        equipmentId: unit.id,
        kind: "imported",
        summary: "Imported from CSV",
        actorUserId: owner.profile.id,
      });
    }
  }

  revalidatePath("/dashboard/equipment");

  return {
    created,
    skipped: rows.length - importable.length,
    codeErrors,
    newTypes,
    newCustomers,
  };
}
