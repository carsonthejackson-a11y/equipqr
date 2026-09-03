export type UserRole = "owner" | "technician";
export type RequestStatus = "new" | "in_progress" | "resolved";
export type MediaKind = "image" | "video";
export type QrCodeSource = "instant" | "batch";

export type Company = {
  id: string;
  name: string;
  slug: string;
  notification_email: string;
  trial_ends_at: string;
  stripe_customer_id: string | null;
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
  created_at: string;
};

export type QrCode = {
  id: string;
  token: string;
  company_id: string;
  equipment_id: string | null;
  source: QrCodeSource;
  claimed_at: string | null;
  created_at: string;
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
  resolution_summary: string | null;
  resolution_recommendations: string | null;
  resolved_at: string | null;
  resolution_email_sent_at: string | null;
  troubleshooting_path: { question: string; answer: string }[];
  ai_summary: string | null;
  created_at: string;
};

export type ServiceRequestMedia = {
  id: string;
  service_request_id: string;
  storage_path: string;
  media_type: MediaKind;
  created_at: string;
};

export type EquipmentGuide = {
  equipment: { id: string; name: string };
  company: { id: string; name: string };
  equipment_type: { id: string; name: string; description: string | null };
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

export type ResolvedQrCode =
  | { status: "not_found" }
  | { status: "unclaimed"; company_id: string }
  | { status: "claimed"; guide: EquipmentGuide };
