// ============================================================
// CHLORE CRM — Types Supabase
// ============================================================

// ---- contacts (table existante, étendue) --------------------

export interface Contact {
  id: string;
  created_at: string;
  updated_at: string | null;
  // Identité
  phone: string;
  name: string | null;          // legacy — conservé pour compatibilité
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  // Adresse
  address: string | null;
  city: string | null;
  postal_code: string | null;
  // Piscine
  pool_type: "hors-terre" | "creusée" | null;
  pool_dimensions: string | null;
  pool_system: string | null;
  has_spa: boolean;
  // Dates
  ouverture_date: string | null;
  // CRM
  stage: string | null;
  services: string[];
  season_price: number | null;
  lead_source: string | null;
  notes: string | null;
}

// ---- messages (table existante, inchangée) ------------------

export interface Message {
  id: string;
  contact_id: string;
  twilio_sid: string | null;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  is_read: boolean;
  created_at: string;
}

// ---- conversations (vue / résultat RPC) ---------------------

export interface Conversation {
  contact_id: string;
  phone: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  stage: string | null;
  notes: string | null;
  last_message: string;
  last_direction: "inbound" | "outbound";
  last_message_at: string;
  unread_count: number;
}

// ---- jobs ---------------------------------------------------

export type JobType = "ouverture" | "entretien" | "fermeture" | "visite" | "autre";
export type JobStatus = "planifié" | "confirmé" | "en_cours" | "complété" | "annulé";

export interface Job {
  id: string;
  created_at: string;
  contact_id: string;
  job_type: JobType;
  scheduled_date: string;       // DATE → "YYYY-MM-DD"
  scheduled_time_start: string | null;  // TIME → "HH:MM"
  scheduled_time_end: string | null;
  status: JobStatus;
  notes: string | null;
  completed_at: string | null;
}

// ---- documents (soumissions, contrats, factures) -----------

export type DocType = "soumission" | "contrat" | "facture";
export type DocStatus = "brouillon" | "envoyé" | "signé" | "payé";

export interface Document {
  id: string;
  created_at: string;
  contact_id: string;
  doc_type: DocType;
  doc_number: string;
  amount: number | null;
  status: DocStatus;
  pdf_url: string | null;
  data: Record<string, unknown> | null;
}

// ---- message_templates -------------------------------------

export type TemplateCategory =
  | "relance"
  | "confirmation"
  | "rappel_paiement"
  | "suivi"
  | "promo"
  | "autre";

export interface MessageTemplate {
  id: string;
  created_at: string;
  name: string;
  body: string;
  category: TemplateCategory | null;
  variables: string[];
}

// ---- payments ----------------------------------------------

export type PaymentMethod = "interac" | "cash" | "cheque" | "carte" | "autre" | "en_attente" | "stripe";
export type PaymentStatus = "en_attente" | "reçu" | "en_retard";

export interface Payment {
  id: string;
  created_at: string;
  contact_id: string;
  document_id: string | null;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  due_date: string | null;      // DATE → "YYYY-MM-DD"
  received_date: string | null;
  notes: string | null;
}

// ---- automations -------------------------------------------

export type AutomationTrigger =
  | "stage_change"
  | "time_delay"
  | "payment_due"
  | "job_reminder";

export type AutomationAction = "send_sms" | "send_email" | "create_task";

export interface Automation {
  id: string;
  created_at: string;
  name: string;
  trigger_type: AutomationTrigger;
  trigger_config: Record<string, unknown>;
  action_type: AutomationAction;
  action_config: Record<string, unknown>;
  is_active: boolean;
}

// ---- automation_logs ---------------------------------------

export interface AutomationLog {
  id: string;
  created_at: string;
  automation_id: string | null;
  contact_id: string | null;
  action: string;
  status: string;
  details: Record<string, unknown> | null;
}

// ---- call_transcripts --------------------------------------

export interface CallTranscript {
  id: string;
  created_at: string;
  contact_id: string | null;
  phone: string;
  duration_seconds: number | null;
  transcript: string | null;
  ai_summary: string | null;
  extracted_data: Record<string, unknown> | null;
  audio_url: string | null;
}
