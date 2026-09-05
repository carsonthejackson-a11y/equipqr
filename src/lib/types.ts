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
  activity: { kind: RequestActivityKind; body: string | null; author_kind: ActorKind; created_at: string }[];
};

export type ServiceRequestMedia = {
  id: string;
  service_request_id: string;
  storage_path: string;
  media_type: MediaKind;
  created_at: string;
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
  };
  company: { id: string } & CompanyPublicProfile;
  equipment_type: { id: string; name: string; description: string | null };
  code: { short_code: string; status: QrCodeStatus };
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
