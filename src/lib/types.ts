export type UserRole = "owner" | "technician";
export type RequestStatus = "new" | "in_progress" | "resolved";
export type MediaKind = "image" | "video";

export type Company = {
  id: string;
  name: string;
  slug: string;
  notification_email: string;
  created_at: string;
};

export type Profile = {
  id: string;
  company_id: string;
  full_name: string | null;
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

export type GuideStep = {
  id: string;
  equipment_type_id: string;
  step_number: number;
  title: string;
  instructions: string;
  media_url: string | null;
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
  qr_token: string;
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
  created_at: string;
};

export type ServiceRequestMedia = {
  id: string;
  service_request_id: string;
  storage_path: string;
  media_type: MediaKind;
  created_at: string;
};

export type EquipmentGuideResponse = {
  equipment: { id: string; name: string; qr_token: string };
  company: { id: string; name: string };
  equipment_type: { id: string; name: string; description: string | null };
  steps: {
    id: string;
    step_number: number;
    title: string;
    instructions: string;
    media_url: string | null;
  }[];
} | null;
