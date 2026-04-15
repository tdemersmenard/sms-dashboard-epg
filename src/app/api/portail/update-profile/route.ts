export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("portal_token")?.value ?? req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, portal_token_expires")
    .eq("portal_token", token)
    .single();

  if (!contact || new Date(contact.portal_token_expires) < new Date()) {
    return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  }

  const body = await req.json();

  // Le client peut modifier seulement ces champs
  const allowedFields: Record<string, string> = {};
  if (body.phone !== undefined) allowedFields.phone = body.phone;
  if (body.email !== undefined) allowedFields.email = body.email.toLowerCase();
  if (body.address !== undefined) allowedFields.address = body.address;
  if (body.city !== undefined) allowedFields.city = body.city;
  if (body.postal_code !== undefined) allowedFields.postal_code = body.postal_code;

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: "Rien à modifier" }, { status: 400 });
  }

  await supabaseAdmin.from("contacts").update(allowedFields).eq("id", contact.id);

  return NextResponse.json({ success: true });
}
