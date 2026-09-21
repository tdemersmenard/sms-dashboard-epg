export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/utils";
import { getAppUrl } from "@/config/brand";
import crypto from "crypto";

/**
 * Connexion portail SANS mot de passe: le client entre son cellulaire,
 * reçoit un code à 6 chiffres par texto. Le code est hashé, expire en
 * 10 minutes, max 3 envois par heure par numéro.
 */

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone } = await req.json();
    const phone = rawPhone ? normalizePhone(String(rawPhone)) : null;
    if (!phone || !/^\+1\d{10}$/.test(phone)) {
      return NextResponse.json({ error: "Entre un numéro de cellulaire valide." }, { status: 400 });
    }

    // Contact le plus récent avec ce numéro (portail = client existant)
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json(
        { error: "On ne trouve pas ce numéro dans nos dossiers. Texte-nous au 450 915-9650 et on règle ça." },
        { status: 404 },
      );
    }

    // Rate limit: max 3 codes / heure / contact
    const key = `portal_otp_${contact.id}`;
    const { data: existing } = await supabaseAdmin
      .from("settings").select("value").eq("key", key).maybeSingle();
    const now = Date.now();
    let sentTimes: number[] = [];
    if (existing?.value) {
      try { sentTimes = (JSON.parse(existing.value).sent_times || []).filter((t: number) => now - t < 3600e3); } catch { /* reset */ }
    }
    if (sentTimes.length >= 3) {
      return NextResponse.json(
        { error: "Trop de codes demandés — réessaie dans une heure ou texte-nous au 450 915-9650." },
        { status: 429 },
      );
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await supabaseAdmin.from("settings").upsert(
      {
        key,
        value: JSON.stringify({
          hash: sha256(code),
          expires: now + 10 * 60e3,
          attempts: 0,
          sent_times: [...sentTimes, now],
        }),
      },
      { onConflict: "key" },
    );

    const res = await fetch(`${getAppUrl()}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: contact.id,
        body: `Ton code de connexion ALTAMAR: ${code}\nIl expire dans 10 minutes. Si tu n'as pas demandé ce code, ignore ce message.`,
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Impossible d'envoyer le texto — réessaie dans un instant." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, firstName: contact.first_name });
  } catch (e) {
    console.error("[otp-request]", e);
    return NextResponse.json({ error: "Erreur — réessaie." }, { status: 500 });
  }
}
