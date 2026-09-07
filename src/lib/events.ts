// Canonical event kinds for the per-unit service-history timeline
// (`equipment_events`) and the per-request activity feed (`request_activity`).
//
// The DB columns are free text on purpose so a new feature can add a kind
// without a migration — but everything the app writes or renders goes
// through this file.
//
// Outbound webhooks hang off these tables at the database level: triggers
// from migration 0022 copy each qualifying row into the `webhook_deliveries`
// outbox for every subscribed endpoint, so nothing here has to know which
// events a company listens to. The one app-side hook is the
// flushWebhooksSoon() call after each successful insert, which asks the
// deliverer (src/lib/webhooks.ts) to drain that company's outbox once the
// response is sent — the 5-minute cron picks up whatever that misses.

import type { SupabaseClient } from "@supabase/supabase-js";
import { flushWebhooksSoon } from "@/lib/webhooks";
import type { ActorKind, EquipmentEvent, RequestActivity, RequestActivityKind } from "@/lib/types";

export const EQUIPMENT_EVENT_KINDS = {
  equipment_created: "Equipment added",
  equipment_updated: "Details updated",
  status_changed: "Status changed",
  note: "Note",
  photo_added: "Photo added",
  document_added: "Document added",
  document_removed: "Document removed",
  code_assigned: "QR code assigned",
  code_replaced: "QR code replaced",
  code_retired: "QR code retired",
  code_reassigned: "QR code moved",
  request_submitted: "Service request submitted",
  request_resolved: "Service request resolved",
  // Next: scheduling-lite, checklists, PM reminders write these.
  visit_scheduled: "Visit scheduled",
  visit_completed: "Visit completed",
  inspection_completed: "Inspection completed",
  pm_due: "Maintenance due",
  imported: "Imported",
} as const;

export type EquipmentEventKind = keyof typeof EQUIPMENT_EVENT_KINDS;

export function equipmentEventLabel(kind: string): string {
  return (EQUIPMENT_EVENT_KINDS as Record<string, string>)[kind] ?? kind.replace(/_/g, " ");
}

export type EmitEquipmentEventInput = {
  companyId: string;
  equipmentId: string;
  kind: EquipmentEventKind;
  summary: string;
  details?: Record<string, unknown>;
  serviceRequestId?: string | null;
  actorKind?: ActorKind;
  actorUserId?: string | null;
  occurredAt?: string;
};

/**
 * Appends a row to the unit's timeline. Best-effort: logs and returns null on
 * failure rather than throwing, because a timeline write must never fail the
 * user action that triggered it. Uses whatever client the caller has (the
 * RLS-scoped server client for staff actions) — RLS enforces company scope.
 */
export async function emitEquipmentEvent(
  supabase: SupabaseClient,
  input: EmitEquipmentEventInput
): Promise<EquipmentEvent | null> {
  const { data, error } = await supabase
    .from("equipment_events")
    .insert({
      company_id: input.companyId,
      equipment_id: input.equipmentId,
      kind: input.kind,
      summary: input.summary,
      details: input.details ?? {},
      service_request_id: input.serviceRequestId ?? null,
      actor_kind: input.actorKind ?? "staff",
      actor_user_id: input.actorUserId ?? null,
      ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
    })
    .select("*")
    .single<EquipmentEvent>();

  if (error) {
    console.error("emitEquipmentEvent failed:", error.message);
    return null;
  }
  flushWebhooksSoon(input.companyId);
  return data;
}

export type EmitRequestActivityInput = {
  companyId: string;
  serviceRequestId: string;
  kind: RequestActivityKind;
  /** Defaults to "internal". Only "customer" rows appear on /r/<token>. */
  visibility?: "internal" | "customer";
  body?: string | null;
  metadata?: Record<string, unknown>;
  authorKind?: ActorKind;
  authorUserId?: string | null;
};

/** Appends a row to a request's activity feed. Best-effort, same contract as emitEquipmentEvent(). */
export async function emitRequestActivity(
  supabase: SupabaseClient,
  input: EmitRequestActivityInput
): Promise<RequestActivity | null> {
  const { data, error } = await supabase
    .from("request_activity")
    .insert({
      company_id: input.companyId,
      service_request_id: input.serviceRequestId,
      kind: input.kind,
      visibility: input.visibility ?? "internal",
      body: input.body ?? null,
      metadata: input.metadata ?? {},
      author_kind: input.authorKind ?? "staff",
      author_user_id: input.authorUserId ?? null,
    })
    .select("*")
    .single<RequestActivity>();

  if (error) {
    console.error("emitRequestActivity failed:", error.message);
    return null;
  }
  flushWebhooksSoon(input.companyId);
  return data;
}
