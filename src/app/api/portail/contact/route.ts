export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

async function getContactFromToken(req: NextRequest) {
  const token = req.cookies.get("portal_token")?.value ?? req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, portal_token_expires")
    .eq("portal_token", token)
    .single();
  if (!data || new Date(data.portal_token_expires) < new Date()) return null;
  return data;
}

export async function POST(req: NextRequest) {
  const contact = await getContactFromToken(req);
  if (!contact) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { message } = await req.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "Message vide" }, { status: 400 });
  }

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";
  const body = `[Portail] ${name}: ${message.trim()}`;

  await supabaseAdmin.from("messages").insert({
    contact_id: contact.id,
    direction: "inbound",
    body,
    is_read: false,
    status: "received",
  });

  return NextResponse.json({ success: true });
}
