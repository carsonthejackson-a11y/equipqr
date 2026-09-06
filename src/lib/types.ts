export type UserRole = "owner" | "technician";
export type RequestStatus =
  | "new"
  | "in_progress"
  | "scheduled"
  | "on_hold"
  | "resolved"
  | "canceled";
export type RequestPriority = "low" | "normal" | "high" | "urgent";
export type EquipmentStatus = "active" | "needs_service" | "out_of_service" | "retired";
export type QrCodeStatus = "active" | "retired" | "replaced";
export type ActorKind = "staff" | "customer" | "system";
export type MediaKind = "image" | "video";
export type QrCodeSource = "instant" | "batch";
export type ServiceRequestSource = "scan" | "staff" | "pm" | "api";

export type Company = {
  id: string;
  name: string;
  slug: string;
  notification_email: string;
  trial_ends_at: string;
  stripe_customer_id: string | null;
  welcome_email_sent_at: string | null;
  trial_reminder_sent_at: string | null;
  onboarding_dismissed_at: string | null;
  // Branding (Pro+) — see src/lib/branding.ts for the resolved, plan-gated view.
  logo_path: string | null;
  brand_color: string | null;
  // Public contact shown on customer-facing pages ("Call us" / "Text us").
  phone: string | null;
  sms_number: string | null;
  website: string | null;
  timezone: string;
  customer_updates_enabled: boolean;
  created_at: string;
};

/** The subset of Company that anonymous customers may see (scan page, /r/ status page, emails). */
export type CompanyPublicProfile = {
  name: string;
  phone: string | null;
  sms_number: string | null;
  website?: string | null;
  logo_path: string | null;
  brand_color: string | null;
};

export type ApiKey = {
  id: string;
  company_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  created_by: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  company_id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
};

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type Invitation = {
  id: string;
  company_id: string;
  email: string;
  role: UserRole;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

// Shape returned by the get_invitation() RPC — the public accept-invite page
// only ever sees this, never raw invitation/company ids.
export type PublicInvitation = {
  company_name: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  expires_at: string;
};

// Shape returned by the get_company_members() RPC (profiles joined to
// auth.users, since profiles has no email column of its own).
export type CompanyMember = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  created_at: string;
};

export type Customer = {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
};

export type EquipmentType = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type GuideOutcome = "continue" | "resolved" | "escalate";

export type GuideStep = {
  id: string;
  equipment_type_id: string;
  title: string;
  instructions: string | null;
  media_url: string | null;
  is_root: boolean;
  created_at: string;
};

// A step/option graph keyed by client-side temp ids rather than real UUIDs —
// shared shape for anything that proposes a whole guide at once (the bulk
// `replaceGuideGraph` action, and the AI drafting assistant that calls it).
export type GuideGraphNode = {
  tempId: string;
  title: string;
  instructions: string | null;
  isRoot: boolean;
  options: {
    label: string;
    outcome: GuideOutcome;
    nextTempId: string | null;
  }[];
};

export type GuideOption = {
  id: string;
  guide_step_id: string;
  label: string;
  sort_order: number;
  outcome: GuideOutcome;
  next_step_id: string | null;
  created_at: string;
};

export type Equipment = {
  id: string;
  company_id: string;
  equipment_type_id: string;
  customer_id: string | null;
  name: string;
  serial_number: string | null;
  location: string | null;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  // v2 record
  make: string | null;
  model: string | null;
  install_date: string | null;
  warranty_ends_on: string | null;
  status: EquipmentStatus;
  notes: string | null;
  photo_path: string | null;
  last_serviced_at: string | null;
  /** Next: PM reminders write this. Unused by the UI until then. */
  next_service_due_on: string | null;
  /** Next: custom fields. Keyed by company-defined field id. */
  custom_fields: Record<string, unknown>;
  updated_at: string;
  created_at: string;
};

export type EquipmentDocument = {
  id: string;
  company_id: string;
  equipment_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

/** One row of the per-unit service-history timeline. `kind` values live in src/lib/events.ts. */
export type EquipmentEvent = {
  id: string;
  company_id: string;
  equipment_id: string;
  kind: string;
  summary: string;
  details: Record<string, unknown>;
  service_request_id: string | null;
  actor_kind: ActorKind;
  actor_user_id: string | null;
  occurred_at: string;
  created_at: string;
};

export type QrCode = {
  id: string;
  /** URL token. Legacy codes: 24 hex chars; batch codes: "XXXX-XXXX"; new codes: same as short_code. */
  token: string;
  /** 8 chars, unambiguous alphabet, stored without the dash. Display as XXXX-XXXX via formatShortCode(). */
  short_code: string;
  company_id: string;
  equipment_id: string | null;
  source: QrCodeSource;
  status: QrCodeStatus;
  replaced_by_id: string | null;
  retired_at: string | null;
  label_printed_at: string | null;
  claimed_at: string | null;
  created_at: string;
};

export type EquipmentScanStats = {
  total: number;
  last_30_days: number;
  last_7_days: number;
  last_scanned_at: string | null;
};

export type ServiceRequest = {
  id: string;
  equipment_id: string;
  company_id: string;
  description: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: RequestStatus;
  priority: RequestPriority;
  assigned_to: string | null;
  assigned_at: string | null;
  customer_id: string | null;
  /** Token for the customer's public /r/<token> status page. */
  public_token: string;
  status_updated_at: string;
  /** Next: scheduling-lite. */
  scheduled_for: string | null;
  closed_by: string | null;
  resolution_summary: string | null;
  resolution_recommendations: string | null;
  resolved_at: string | null;
  resolution_email_sent_at: string | null;
  troubleshooting_path: { question: string; answer: string }[];
  ai_summary: string | null;
  updated_at: string;
  created_at: string;
  // ---- Next roadmap (migration 0019) ----
  /** scan = customer via sticker; staff = dashboard / staff scan mode; pm = maintenance schedule; api = /api/v1. */
  source: ServiceRequestSource;
  maintenance_schedule_id: string | null;
  inspection_id: string | null;
  /** Scheduling-lite: length of the planned visit. */
  scheduled_duration_minutes: number;
  reminder_sent_at: string | null;
  on_my_way_sent_at: string | null;
  /** Two-way messaging: set by add_customer_request_update(). */
  last_customer_message_at: string | null;
  /** Zeroed by the dashboard when staff open the request. */
  unread_customer_messages: number;
  /** Close-out sign-off (staff scan mode). Object in the private service-request-media bucket. */
  signature_path: string | null;
  signed_by_name: string | null;
  signed_at: string | null;
};

export type RequestActivityKind =
  | "note"
  | "message"
  | "status_change"
  | "assignment"
  | "priority_change"
  | "email_sent"
  | "system";

export type RequestActivity = {
  id: string;
  company_id: string;
  service_request_id: string;
  kind: RequestActivityKind;
  /** "internal" = staff only; "customer" = also shown on /r/<token>. */
  visibility: "internal" | "customer";
  body: string | null;
  metadata: Record<string, unknown>;
  author_kind: ActorKind;
  author_user_id: string | null;
  created_at: string;
};

/** Shape returned by get_request_status() for the public /r/<token> page. */
export type PublicRequestStatus = {
  status: RequestStatus;
  priority: RequestPriority;
  created_at: string;
  status_updated_at: string;
  scheduled_for: string | null;
  resolved_at: string | null;
  resolution_summary: string | null;
  resolution_recommendations: string | null;
  contact_name: string;
  description: string;
  equipment: { name: string; location: string | null };
  company: CompanyPublicProfile;
  assigned_to_name: string | null;
  activity: {
    kind: RequestActivityKind;
    body: string | null;
    author_kind: ActorKind;
    created_at: string;
    /** Migration 0021: the name a customer typed into the message composer. Only set on customer `message` rows. */
    author_name?: string | null;
  }[];
};

export type ServiceRequestMedia = {
  id: string;
  service_request_id: string;
  storage_path: string;
  media_type: MediaKind;
  created_at: string;
  // ---- Next roadmap (migration 0019) ----
  /** customer = uploaded with the request; staff = before/after photos added at close-out. */
  origin: "customer" | "staff";
  caption: string | null;
  uploaded_by: string | null;
  company_id: string | null;
};

export type EquipmentGuide = {
  equipment: {
    id: string;
    name: string;
    make: string | null;
    model: string | null;
    location: string | null;
    status: EquipmentStatus;
    photo_path: string | null;
    last_serviced_at: string | null;
    /** Next roadmap: earliest active maintenance schedule (may be undefined on cached payloads). */
    next_service_due_on?: string | null;
  };
  company: { id: string } & CompanyPublicProfile;
  equipment_type: { id: string; name: string; description: string | null };
  code: { short_code: string; status: QrCodeStatus };
  /**
   * Open (new / in_progress / scheduled / on_hold) requests on this unit,
   * newest first, max 5 — migration 0019. Shown to ANYONE who scans so a
   * second person at the site can check status instead of filing a duplicate.
   */
  open_requests: OpenRequestSummary[];
  root_step_id: string | null;
  steps: {
    id: string;
    title: string;
    instructions: string | null;
    media_url: string | null;
    is_root: boolean;
    options: {
      id: string;
      label: string;
      outcome: GuideOutcome;
      next_step_id: string | null;
    }[];
  }[];
};

export type ScanEvent = {
  id: string;
  qr_code_id: string;
  company_id: string;
  equipment_id: string | null;
  scanned_at: string;
  user_agent: string | null;
  source: "qr" | "short_code" | "link";
};

export type ResolvedQrCode =
  | { status: "not_found" }
  | { status: "unclaimed"; company_id: string }
  | { status: "retired"; company_id: string }
  | { status: "claimed"; guide: EquipmentGuide };

/**
 * What get_request_status() returns after migration 0015: the same payload
 * plus the company id, which the public /r/<token> page needs to look up the
 * plan and apply the branding entitlement gate. Appended rather than folded
 * into PublicRequestStatus so existing callers keep compiling unchanged.
 */
export type PublicRequestStatusWithCompanyId = Omit<PublicRequestStatus, "company"> & {
  company: CompanyPublicProfile & { id: string };
};

// ============================================================================
// Next roadmap (migration 0019) — see docs/NEXT-ROADMAP-BRIEF.md
// ============================================================================

/** One open request as returned inside resolve_qr_code().guide.open_requests. */
export type OpenRequestSummary = {
  id: string;
  /** Lets the scanner open /r/<token> and add a note. */
  public_token: string;
  status: RequestStatus;
  priority: RequestPriority;
  /** First 280 chars. */
  description: string;
  contact_first_name: string;
  created_at: string;
  status_updated_at: string;
  scheduled_for: string | null;
  assigned_to_name: string | null;
  /** Count of customer-visible activity rows. */
  update_count: number;
};

/** What add_customer_request_update() returns. Email fields are service-role only. */
export type CustomerRequestUpdateResult = {
  request_id: string;
  status: RequestStatus;
  company_id: string;
  company_name: string;
  company_notification_email: string | null;
  assigned_to: string | null;
  assigned_to_email: string | null;
  equipment_name: string;
  contact_name: string;
};

export type ChecklistItemKind = "check" | "pass_fail" | "text" | "number" | "photo";

/** One row of checklist_templates.items. */
export type ChecklistItem = {
  id: string;
  label: string;
  kind: ChecklistItemKind;
  required: boolean;
  help: string | null;
};

export type ChecklistTemplate = {
  id: string;
  company_id: string;
  /** null = usable on any equipment type. */
  equipment_type_id: string | null;
  name: string;
  description: string | null;
  items: ChecklistItem[];
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InspectionItemResponse = {
  /** check → boolean; pass_fail → "pass" | "fail" | null; text → string; number → number; photo → null (see photo_paths). */
  value: boolean | string | number | null;
  passed: boolean | null;
  note: string | null;
  /** Objects in the private `equipment-files` bucket: <company_id>/inspections/<inspection_id>/<uuid>.jpg */
  photo_paths: string[];
};

/** One row of inspections.items — a snapshot of the template item plus the response. */
export type InspectionItem = ChecklistItem & { response: InspectionItemResponse };

export type InspectionStatus = "in_progress" | "completed" | "abandoned";

export type Inspection = {
  id: string;
  company_id: string;
  equipment_id: string;
  checklist_template_id: string | null;
  service_request_id: string | null;
  maintenance_schedule_id: string | null;
  performed_by: string | null;
  status: InspectionStatus;
  template_name: string;
  items: InspectionItem[];
  summary: string | null;
  failed_count: number;
  /** Object in `equipment-files`: <company_id>/inspections/<id>/signature.png */
  signature_path: string | null;
  signed_by_name: string | null;
  signed_at: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MaintenanceSchedule = {
  id: string;
  company_id: string;
  equipment_id: string;
  name: string;
  description: string | null;
  interval_days: number;
  /** Days before next_due_on that the PM request is created. */
  lead_days: number;
  next_due_on: string;
  last_completed_on: string | null;
  auto_create_request: boolean;
  notify_customer: boolean;
  checklist_template_id: string | null;
  last_generated_for: string | null;
  last_request_id: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** One row returned by generate_due_maintenance_requests() (cron, service role). */
export type GeneratedMaintenanceRequest = {
  request_id: string;
  public_token: string;
  company_id: string;
  company_name: string;
  company_notification_email: string;
  company_phone: string | null;
  company_logo_path: string | null;
  company_brand_color: string | null;
  customer_updates_enabled: boolean;
  notify_customer: boolean;
  equipment_id: string;
  equipment_name: string;
  schedule_id: string;
  schedule_name: string;
  due_on: string;
  contact_name: string;
  contact_email: string | null;
};
