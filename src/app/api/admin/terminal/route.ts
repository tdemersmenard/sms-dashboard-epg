export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getDBContext() {
  const [{ data: contacts }, { data: jobs }, { data: payments }] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, address, stage, notes")
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("jobs")
      .select("id, contact_id, job_type, scheduled_date, status, price")
      .order("scheduled_date", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("payments")
      .select("id, contact_id, amount, status, description, received_date")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return { contacts: contacts || [], jobs: jobs || [], payments: payments || [] };
}

async function executeAction(action: { type: string; payload: Record<string, unknown> }) {
  const { type, payload } = action;

  if (type === "create_payment") {
    const { contact_id, amount, description, status } = payload as {
      contact_id: string; amount: number; description: string; status: string;
    };
    const { data, error } = await supabaseAdmin
      .from("payments")
      .insert({ contact_id, amount, description, status: status || "en attente" })
      .select()
      .single();
    if (error) throw error;
    return `Paiement créé: ${description} — ${amount}$ (${data.id})`;
  }

  if (type === "update_payment") {
    const { payment_id, ...updates } = payload as { payment_id: string; [k: string]: unknown };
    const { error } = await supabaseAdmin.from("payments").update(updates).eq("id", payment_id);
    if (error) throw error;
    return `Paiement ${payment_id} mis à jour`;
  }

  if (type === "create_contact") {
    const { first_name, last_name, phone, address, stage } = payload as {
      first_name: string; last_name?: string; phone?: string; address?: string; stage?: string;
    };
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .insert({ first_name, last_name, phone, address, stage: stage || "lead" })
      .select()
      .single();
    if (error) throw error;
    return `Contact créé: ${first_name} ${last_name || ""} (${data.id})`;
  }

  if (type === "update_contact") {
    const { contact_id, ...updates } = payload as { contact_id: string; [k: string]: unknown };
    const { error } = await supabaseAdmin.from("contacts").update(updates).eq("id", contact_id);
    if (error) throw error;
    return `Contact ${contact_id} mis à jour`;
  }

  if (type === "delete_contact") {
    const { contact_id } = payload as { contact_id: string };
    const { error } = await supabaseAdmin.from("contacts").delete().eq("id", contact_id);
    if (error) throw error;
    return `Contact ${contact_id} supprimé`;
  }

  if (type === "create_job") {
    const { contact_id, job_type, scheduled_date, status, price } = payload as {
      contact_id: string; job_type: string; scheduled_date: string; status?: string; price?: number;
    };
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .insert({ contact_id, job_type, scheduled_date, status: status || "prévu", price })
      .select()
      .single();
    if (error) throw error;
    return `Job créé: ${job_type} le ${scheduled_date} (${data.id})`;
  }

  if (type === "send_sms") {
    const { contact_id, message } = payload as { contact_id: string; message: string };
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resp = await fetch(`${baseUrl}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contact_id, body: message }),
    });
    if (!resp.ok) throw new Error("Échec envoi SMS");
    return `SMS envoyé au contact ${contact_id}`;
  }

  if (type === "create_portal") {
    const { contact_id } = payload as { contact_id: string };
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resp = await fetch(`${baseUrl}/api/portail/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contact_id }),
    });
    if (!resp.ok) throw new Error("Échec création portail");
    return `Portail client créé pour ${contact_id}`;
  }

  throw new Error(`Action inconnue: ${type}`);
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json() as {
      messages: { role: "user" | "assistant"; content: string }[];
    };

    const ctx = await getDBContext();

    const systemPrompt = `Tu es l'assistant administratif de Thomas, propriétaire d'Entretien Piscine Granby.
Tu as accès à la base de données du CRM CHLORE et tu peux exécuter des actions.

CONTEXTE ACTUEL (${new Date().toLocaleDateString("fr-CA")}):
- Clients récents: ${ctx.contacts.slice(0, 10).map(c => `[${c.id}] ${c.first_name} ${c.last_name || ""} (${c.phone || "?"}) — stage: ${c.stage}`).join("\n  ")}
- Jobs récents: ${ctx.jobs.slice(0, 10).map(j => `[${j.id}] contact:${j.contact_id} ${j.job_type} le ${j.scheduled_date} — ${j.status}`).join("\n  ")}
- Paiements récents: ${ctx.payments.slice(0, 10).map(p => `[${p.id}] contact:${p.contact_id} ${p.amount}$ — ${p.status}`).join("\n  ")}

Tu peux exécuter ces actions en répondant avec un JSON structuré:
{
  "message": "Explication en français de ce que tu fais",
  "actions": [
    { "type": "create_payment", "payload": { "contact_id": "...", "amount": 0, "description": "...", "status": "reçu|en attente" } },
    { "type": "update_payment", "payload": { "payment_id": "...", "status": "reçu", "received_date": "2024-01-01" } },
    { "type": "create_contact", "payload": { "first_name": "...", "last_name": "...", "phone": "...", "address": "...", "stage": "lead|client" } },
    { "type": "update_contact", "payload": { "contact_id": "...", "stage": "...", "notes": "..." } },
    { "type": "delete_contact", "payload": { "contact_id": "..." } },
    { "type": "create_job", "payload": { "contact_id": "...", "job_type": "entretien|ouverture|fermeture", "scheduled_date": "2024-05-01", "price": 0 } },
    { "type": "send_sms", "payload": { "contact_id": "...", "message": "..." } },
    { "type": "create_portal", "payload": { "contact_id": "..." } }
  ]
}

Si aucune action n'est nécessaire (question simple), réponds avec:
{ "message": "Ta réponse", "actions": [] }

Réponds TOUJOURS en JSON valide uniquement, sans markdown.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    let parsed: { message: string; actions: { type: string; payload: Record<string, unknown> }[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text, actions: [] };
    }

    const results: string[] = [];
    for (const action of parsed.actions || []) {
      try {
        const result = await executeAction(action);
        results.push(result);
      } catch (err) {
        results.push(`Erreur (${action.type}): ${String(err)}`);
      }
    }

    return NextResponse.json({
      message: parsed.message,
      results,
    });
  } catch (err) {
    console.error("[admin/terminal] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
