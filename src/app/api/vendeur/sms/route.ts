export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAppUrl } from "@/config/brand";
import { getCurrentCloser } from "@/lib/vendeur/server";

/**
 * SMS manuel envoyé par un closer — part du MÊME numéro Twilio et vit dans le
 * MÊME fil que les messages du bot, identifié sent_via='closer'.
 * Double sécurité: la RLS protège les lectures, ET ici on revérifie que le
 * lead est bien assigné au closer connecté avant d'envoyer.
 */
export async function POST(req: NextRequest) {
  const closer = await getCurrentCloser();
  if (!closer) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { contactId, body } = await req.json();
  if (!contactId || !body?.trim()) return NextResponse.json({ error: "contactId et body requis" }, { status: 400 });

  // Le lead est-il bien assigné à CE closer ?
  const { data: lead } = await supabaseAdmin
    .from("contacts").select("id, assigned_to").eq("id", contactId).maybeSingle();
  if (!lead || lead.assigned_to !== closer.profile.id) {
    return NextResponse.json({ error: "Ce lead ne t'est pas assigné" }, { status: 403 });
  }

  const res = await fetch(`${getAppUrl()}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, body: body.trim(), sentVia: "closer", sentByCloser: closer.profile.id }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    return NextResponse.json({ error: e.error || "Envoi échoué" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
