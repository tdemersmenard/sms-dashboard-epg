export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  // Token de sécurité simple pour pas que n'importe qui voie ton calendrier
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Charger tous les jobs futurs + les 30 derniers jours
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("*, contacts(first_name, last_name, address, phone)")
    .gte("scheduled_date", thirtyDaysAgo)
    .order("scheduled_date", { ascending: true });

  // Générer le fichier iCal
  const now = new Date();
  const formatDate = (date: string, time: string) => {
    const [y, m, d] = date.split("-");
    const [h, min] = (time || "08:00").split(":");
    return `${y}${m}${d}T${h}${min}00`;
  };

  const typeEmoji: Record<string, string> = {
    ouverture: "🔓",
    fermeture: "🔒",
    entretien: "🏊",
    spa: "💆",
    réparation: "🔧",
  };

  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CHLORE CRM//Entretien Piscine Granby//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CHLORE - Piscines",
    "X-WR-TIMEZONE:America/Montreal",
    "BEGIN:VTIMEZONE",
    "TZID:America/Montreal",
    "BEGIN:DAYLIGHT",
    "DTSTART:20260308T020000",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:20261101T020000",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const job of jobs || []) {
    const contact = job.contacts;
    const name = contact ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() : "Client";
    const emoji = typeEmoji[job.job_type] || "📋";
    const address = contact?.address || "";
    const phone = contact?.phone || "";
    const startTime = (job.scheduled_time_start || "08:00:00").slice(0, 5);
    const endTime = (job.scheduled_time_end || "09:00:00").slice(0, 5);

    const summary = `${emoji} ${job.job_type.charAt(0).toUpperCase() + job.job_type.slice(1)} - ${name}`;
    const description = [
      `Client: ${name}`,
      phone ? `Tel: ${phone}` : "",
      address ? `Adresse: ${address}` : "",
      job.notes || "",
      job.confirmed_at ? "✅ Confirmé" : "⏳ Non confirmé",
    ].filter(Boolean).join("\\n");

    const location = address ? address.replace(/,/g, "\\,") : "";

    ical.push(
      "BEGIN:VEVENT",
      `UID:${job.id}@chlore-crm`,
      `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;TZID=America/Montreal:${formatDate(job.scheduled_date, startTime)}`,
      `DTEND;TZID=America/Montreal:${formatDate(job.scheduled_date, endTime)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      location ? `LOCATION:${location}` : "",
      job.confirmed_at ? "STATUS:CONFIRMED" : "STATUS:TENTATIVE",
      `CATEGORIES:${job.job_type.toUpperCase()}`,
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:Demain: ${summary}`,
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      `DESCRIPTION:Dans 1h: ${summary}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  ical.push("END:VCALENDAR");

  // Filtrer les lignes vides
  const icalStr = ical.filter(l => l !== "").join("\r\n");

  return new NextResponse(icalStr, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=chlore.ics",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
