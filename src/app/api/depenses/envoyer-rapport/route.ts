export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateRapportMoisBuffer } from "@/lib/depenses-pdf";
import { getAuthedGmail } from "@/lib/google";
import { MOIS_FR, fmt, montantDeductible, CATS, TAUX_MARGINAL } from "@/lib/depenses-config";
import type { Depense } from "@/lib/depenses-config";

export async function POST(req: NextRequest) {
  try {
    const { annee, mois } = await req.json() as { annee: number; mois: number };

    if (!annee || !mois || mois < 1 || mois > 12) {
      return NextResponse.json({ error: "annee et mois (1-12) requis" }, { status: 400 });
    }

    const nomMois = MOIS_FR[mois - 1];
    const moisPadded = String(mois).padStart(2, "0");
    const dateFrom = `${annee}-${moisPadded}-01`;
    const dateTo = `${annee}-${moisPadded}-31`;

    const { data, error } = await supabaseAdmin
      .from("depenses")
      .select("*")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true });

    if (error) throw error;

    const depenses = (data as Depense[]) || [];
    const pdfBuffer = await generateRapportMoisBuffer(depenses, mois, annee);
    const pdfBase64 = pdfBuffer.toString("base64");

    // Stats pour le corps du courriel
    const totalM = depenses.reduce((s, d) => s + d.montant, 0);
    const totalD = depenses.reduce((s, d) => s + montantDeductible(d.montant, CATS[d.categorie].pct), 0);
    const economie = totalD * TAUX_MARGINAL;
    const nbRecus = depenses.filter(d => d.recu_url).length;
    const sansRecu = depenses.filter(d => !d.recu_url).length;

    const toEmail = process.env.DEPENSES_REPORT_EMAIL || "service@entretienpiscinegranby.com";
    const subject = `Rapport dépenses — ${nomMois} ${annee}`;
    const filename = `rapport-depenses-${nomMois.toLowerCase()}-${annee}.pdf`;

    const gmail = await getAuthedGmail();
    const boundary = `boundary_depenses_${Date.now()}`;

    const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#0a1f3f;padding:24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:20px;">Rapport mensuel — ${nomMois} ${annee}</h1>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Entretien Piscine Granby</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="padding:12px;background:#f9fafb;border-radius:6px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Total dépenses</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#111827;">${fmt(totalM)}</p>
        </td>
        <td style="width:12px;"></td>
        <td style="padding:12px;background:#f0fdf4;border-radius:6px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Total déductible</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#16a34a;">${fmt(totalD)}</p>
        </td>
        <td style="width:12px;"></td>
        <td style="padding:12px;background:#eff6ff;border-radius:6px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Économie d&apos;impôt est.</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#2563eb;">${fmt(economie)}</p>
        </td>
      </tr>
    </table>
    <p style="font-size:13px;color:#374151;">
      <strong>${depenses.length} dépense${depenses.length > 1 ? "s" : ""}</strong> enregistrée${depenses.length > 1 ? "s" : ""} ce mois-ci.
      Reçus attachés: <strong>${nbRecus}/${depenses.length}</strong>.
      ${sansRecu > 0 ? `<span style="color:#d97706;"> ⚠ ${sansRecu} dépense${sansRecu > 1 ? "s" : ""} sans reçu.</span>` : ""}
    </p>
    <p style="font-size:13px;color:#6b7280;">Le rapport complet en PDF est joint à ce courriel.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
    <p style="font-size:12px;color:#9ca3af;margin:0;">
      Entretien Piscine Granby — Thomas Demers-Ménard<br>
      450-994-2215 — service@entretienpiscinegranby.com
    </p>
  </div>
</div>`;

    const rawEmail = [
      `From: "Entretien Piscine Granby" <me>`,
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody,
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      pdfBase64,
      `--${boundary}--`,
    ].join("\r\n");

    const encodedMessage = Buffer.from(rawEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    // Log dans automation_logs (best-effort, no await)
    void supabaseAdmin.from("automation_logs").insert({
      action: `depenses_rapport_${annee}_${moisPadded}`,
      status: "success",
      details: { annee, mois, to: toEmail, nb_depenses: depenses.length, total: totalM },
    });

    return NextResponse.json({
      ok: true,
      sent_to: toEmail,
      mois: nomMois,
      annee,
      nb_depenses: depenses.length,
    });
  } catch (err) {
    console.error("[depenses/envoyer-rapport]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
