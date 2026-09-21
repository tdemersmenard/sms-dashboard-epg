export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/utils";
import crypto from "crypto";

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** Vérifie le code SMS et émet le même portal_token que le login classique. */
export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, code } = await req.json();
    const phone = rawPhone ? normalizePhone(String(rawPhone)) : null;
    if (!phone || !/^\d{6}$/.test(String(code || ""))) {
      return NextResponse.json({ error: "Code invalide." }, { status: 400 });
    }

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, email")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!contact) return NextResponse.json({ error: "Numéro introuvable." }, { status: 404 });

    const key = `portal_otp_${contact.id}`;
    const { data: row } = await supabaseAdmin.from("settings").select("value").eq("key", key).maybeSingle();
    if (!row?.value) return NextResponse.json({ error: "Demande d'abord un code." }, { status: 400 });

    const otp = JSON.parse(row.value) as { hash: string; expires: number; attempts: number; sent_times: number[] };

    if (Date.now() > otp.expires) {
      return NextResponse.json({ error: "Code expiré — demande-en un nouveau." }, { status: 400 });
    }
    if (otp.attempts >= 5) {
      return NextResponse.json({ error: "Trop d'essais — demande un nouveau code." }, { status: 429 });
    }

    if (otp.hash !== sha256(String(code))) {
      await supabaseAdmin.from("settings").upsert(
        { key, value: JSON.stringify({ ...otp, attempts: otp.attempts + 1 }) },
        { onConflict: "key" },
      );
      return NextResponse.json({ error: "Mauvais code — vérifie ton texto." }, { status: 401 });
    }

    // Code bon → même mécanique de session que le login classique
    await supabaseAdmin.from("settings").delete().eq("key", key);
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await supabaseAdmin.from("contacts").update({
      portal_token: token,
      portal_token_expires: expires.toISOString(),
    }).eq("id", contact.id);

    return NextResponse.json({
      success: true,
      token,
      client: {
        id: contact.id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
      },
    });
  } catch (e) {
    console.error("[otp-verify]", e);
    return NextResponse.json({ error: "Erreur — réessaie." }, { status: 500 });
  }
}
