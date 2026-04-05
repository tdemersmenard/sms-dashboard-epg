export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, portal_password, portal_token_expires")
      .eq("portal_token", token)
      .single();

    if (!contact || new Date(contact.portal_token_expires) < new Date()) {
      return NextResponse.json({ error: "Session expirée" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    if (!contact.portal_password) {
      return NextResponse.json({ error: "Aucun mot de passe configuré" }, { status: 400 });
    }

    const valid = await bcrypt.compare(currentPassword, contact.portal_password);
    if (!valid) {
      return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await supabaseAdmin
      .from("contacts")
      .update({ portal_password: hashed })
      .eq("id", contact.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[change-password] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
