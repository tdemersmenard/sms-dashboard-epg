import { supabaseAdmin } from "@/lib/supabase";

const GMAPS = process.env.GOOGLE_MAPS_API_KEY!;

async function geocode(addr: string) {
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GMAPS}`);
  const data = await res.json();
  return data.results?.[0]?.geometry?.location || null;
}

export async function checkAndAutoAssign(): Promise<string[]> {
  const results: string[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
  const dayToJS: Record<string, number> = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 };

  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, address, city, services, ouverture_date")
    .not("services", "is", null);

  for (const c of contacts || []) {
    const svcs = c.services || [];
    if (!svcs.some((s: string) => s.toLowerCase().includes("entretien") || s.toLowerCase().includes("spa"))) continue;
    if (!c.address || c.address.length < 5 || !c.ouverture_date) continue;

    const { data: existing } = await supabaseAdmin.from("jobs").select("id").eq("contact_id", c.id).eq("job_type", "entretien").limit(1);
    if (existing && existing.length > 0) continue;

    const addr = c.city && !c.address.toLowerCase().includes(c.city.toLowerCase())
      ? `${c.address}, ${c.city}, QC, Canada` : `${c.address}, Granby, QC, Canada`;
    const geo = await geocode(addr);
    if (!geo) continue;

    // Compter les clients par jour
    const dayCounts: Record<string, number> = { Lundi: 0, Mardi: 0, Mercredi: 0, Jeudi: 0, Vendredi: 0 };
    const { data: allJobs } = await supabaseAdmin
      .from("jobs")
      .select("notes, contact_id")
      .eq("job_type", "entretien")
      .gte("scheduled_date", new Date().toISOString().split("T")[0]);

    const counted = new Set<string>();
    for (const j of allJobs || []) {
      const key = `${j.contact_id}_${j.notes}`;
      if (counted.has(key)) continue;
      counted.add(key);
      const match = (j.notes || "").match(/Route (\w+)/);
      if (match && dayCounts[match[1]] !== undefined) dayCounts[match[1]]++;
    }

    let bestDay = "Lundi";
    let minCount = Infinity;
    for (const [d, count] of Object.entries(dayCounts)) {
      if (count < minCount && count < 5) { minCount = count; bestDay = d; }
    }

    const position = dayCounts[bestDay] + 1;
    const arrivalMin = 8 * 60 + (position - 1) * 60;
    const arrival = `${String(Math.floor(arrivalMin / 60)).padStart(2, "0")}:${String(arrivalMin % 60).padStart(2, "0")}`;
    const endMin = arrivalMin + 60;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    const target = dayToJS[bestDay];
    const ouv = new Date(c.ouverture_date + "T12:00:00");
    const first = new Date(ouv);
    first.setDate(first.getDate() + 7);
    while (first.getDay() !== target) first.setDate(first.getDate() + 1);

    const isBiweekly = svcs.some((s: string) => s.includes("2 semaines"));
    const increment = isBiweekly ? 14 : 7;
    const endDate = new Date("2026-09-30T23:59:59");
    const cur = new Date(first);
    let count = 0;

    while (cur <= endDate) {
      await supabaseAdmin.from("jobs").insert({
        contact_id: c.id,
        job_type: "entretien",
        scheduled_date: cur.toISOString().split("T")[0],
        scheduled_time_start: arrival,
        scheduled_time_end: endTime,
        status: "planifié",
        notes: `Route ${bestDay} — Arrêt #${position}`,
      });
      count++;
      cur.setDate(cur.getDate() + increment);
    }

    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    results.push(`Auto-assigné: ${name} → ${bestDay} (${count} passages)`);

    if (c.phone?.startsWith("+")) {
      const freq = isBiweekly ? "aux deux semaines" : "chaque semaine";
      const debutStr = first.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: c.id,
          body: `Bonjour ${c.first_name || name}! Votre entretien de piscine est planifié ${freq} le ${bestDay.toLowerCase()}, arrivée vers ${arrival}. Premier passage le ${debutStr}. Bonne saison!`,
        }),
      });
    }

    const { data: thomas } = await supabaseAdmin.from("contacts").select("id").eq("phone", "+14509942215").single();
    if (thomas) {
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: thomas.id,
          body: `CHLORE: Nouveau client auto-assigné → ${name} le ${bestDay} à ${arrival} (${count} passages). Premier entretien: ${first.toISOString().split("T")[0]}`,
        }),
      });
    }
  }

  return results;
}
