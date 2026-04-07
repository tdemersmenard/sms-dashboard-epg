export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId requis" }, { status: 400 });

    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id, contact_id, scheduled_date, scheduled_time_start, job_type, confirmed_at")
      .eq("id", jobId)
      .single();

    if (!job) return NextResponse.json({ error: "Job non trouvé" }, { status: 404 });
    if (job.confirmed_at) return NextResponse.json({ error: "Déjà confirmée" }, { status: 400 });
    if (job.job_type !== "ouverture") return NextResponse.json({ error: "Pas une ouverture" }, { status: 400 });

    // Récupérer le contact
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, phone")
      .eq("id", job.contact_id)
      .single();

    if (!contact) return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });

    // Marquer comme confirmé
    await supabaseAdmin
      .from("jobs")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", jobId);

    // Envoyer le SMS au client
    if (contact.phone?.startsWith("+")) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
      const dateStr = new Date(job.scheduled_date + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
      const heure = job.scheduled_time_start ? job.scheduled_time_start.slice(0, 5) : "8h00";
      const name = contact.first_name || "Bonjour";

      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: job.contact_id,
          body: `Bonjour ${name}! Petit rappel: votre ouverture de piscine est confirmée pour le ${dateStr} à ${heure}. Thomas sera là!`,
        }),
      });

      // Notifier Thomas aussi
      const { data: thomas } = await supabaseAdmin.from("contacts").select("id").eq("phone", "+14509942215").single();
      if (thomas) {
        await fetch(`${baseUrl}/api/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: thomas.id,
            body: `CHLORE: Ouverture confirmée pour ${name} le ${dateStr} à ${heure}. SMS envoyé au client.`,
          }),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
