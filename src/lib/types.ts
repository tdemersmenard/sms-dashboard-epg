export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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

export interface Conversation {
  contact_id: string;
  phone: string;
  name: string | null;
  notes: string | null;
  last_message: string;
  last_direction: "inbound" | "outbound";
  last_message_at: string;
  unread_count: number;
}
