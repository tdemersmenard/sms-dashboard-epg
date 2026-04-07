import { supabaseAdmin } from "@/lib/supabase";

const GMAPS = process.env.GOOGLE_MAPS_API_KEY!;
const HOME_ADDR = "86 rue de Windsor, Granby, QC, Canada";
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const DAY_TO_JS: Record<string, number> = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 };
const MAX_PER_DAY = 5;

async function geocode(addr: string) {
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GMAPS}`);
  const data = await res.json();
  return data.results?.[0]?.geometry?.location || null;
}

export async function autoAssignNewClients(): Promise<string[]> {
  const results: string[] = [];

  // Check si désactivé
  const { data: setting } = await supabaseAdmin.from("settings").select("value").eq("key", "routes_auto_disabled").single();
  if (setting?.value === "true") return ["Auto-assign disabled"];

  // 1. Trouver les clients candidats (entretien + adresse + ouverture)
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, address, city, services, ouverture_date")
    .not("services", "is", null);

  const candidates = (contacts || []).filter(c => {
    const svcs = c.services || [];
    return svcs.some((s: string) => s.toLowerCase().includes("entretien")) && c.address && c.address.length > 5 && c.ouverture_date;
  });

  if (candidates.length === 0) return [];

  // 2. Pour chaque candidat, vérifier s'il a déjà des entretiens
  for (const candidate of candidates) {
    const { data: existing } = await supabaseAdmin
      .from("jobs")
      .select("id")
      .eq("contact_id", candidate.id)
      .eq("job_type", "entretien")
      .limit(1);

    if (existing && existing.length > 0) continue; // Déjà assigné, skip

    // Géocoder le nouveau client
    const fullAddr = candidate.city && !candidate.address.toLowerCase().includes(candidate.city.toLowerCase())
      ? `${candidate.address}, ${candidate.city}, QC, Canada`
      : `${candidate.address}, Granby, QC, Canada`;
    const geo = await geocode(fullAddr);
    if (!geo) continue;

    const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || candidate.phone;
    const isBiweekly = (candidate.services || []).some((s: string) => s.includes("2 semaines"));

    // 3. Compter les clients existants par jour
    const dayLoads: Record<string, { count: number; clients: any[] }> = {};
    for (const d of DAYS) dayLoads[d] = { count: 0, clients: [] };

    const today = new Date().toISOString().split("T")[0];
    const { data: futureJobs } = await supabaseAdmin
      .from("jobs")
      .select("contact_id, notes")
      .eq("job_type", "entretien")
      .gte("scheduled_date", today);

    const seenContacts = new Set<string>();
    for (const j of futureJobs || []) {
      if (seenContacts.has(j.contact_id)) continue;
      seenContacts.add(j.contact_id);
      const dayMatch = j.notes?.match(/Route (\w+)/);
      const day = dayMatch?.[1];
      if (!day || !dayLoads[day]) continue;

      const { data: cContact } = await supabaseAdmin.from("contacts").select("address, city").eq("id", j.contact_id).single();
      if (cContact?.address) {
        const cAddr = cContact.city && !cContact.address.toLowerCase().includes(cContact.city.toLowerCase())
          ? `${cContact.address}, ${cContact.city}, QC, Canada`
          : `${cContact.address}, Granby, QC, Canada`;
        const cGeo = await geocode(cAddr);
        if (cGeo) {
          dayLoads[day].count++;
          dayLoads[day].clients.push({ lat: cGeo.lat, lng: cGeo.lng });
        }
      }
    }

    // 4. Trouver le meilleur jour
    let bestDay = DAYS[0];
    let bestScore = Infinity;
    for (const d of DAYS) {
      if (dayLoads[d].count >= MAX_PER_DAY) continue;
      let prox = 50;
      if (dayLoads[d].clients.length > 0) {
        let totalDist = 0;
        for (const ex of dayLoads[d].clients) {
          const dlat = geo.lat - ex.lat;
          const dlng = geo.lng - ex.lng;
          totalDist += Math.sqrt(dlat * dlat + dlng * dlng);
        }
        prox = (totalDist / dayLoads[d].clients.length) * 1000;
      }
      const score = prox + dayLoads[d].count * 20;
      if (score < bestScore) { bestScore = score; bestDay = d; }
    }

    // 5. Calculer la position et l'heure (8h00 + (position-1) * 1h)
    const position = dayLoads[bestDay].count + 1;
    const startMinutes = 8 * 60 + (position - 1) * 60;
    const arrivalTime = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
    const endMinutes = startMinutes + 60;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    // 6. Premier entretien
    const target = DAY_TO_JS[bestDay];
    const ouv = new Date(candidate.ouverture_date + "T12:00:00");
    const first = new Date(ouv);
    first.setDate(first.getDate() + 7);
    while (first.getDay() !== target) first.setDate(first.getDate() + 1);

    // 7. Créer les jobs (sans toucher aux autres clients)
    const endDate = new Date("2026-09-30T23:59:59");
    const cur = new Date(first);
    const increment = isBiweekly ? 14 : 7;
    let count = 0;

    while (cur <= endDate) {
      await supabaseAdmin.from("jobs").insert({
        contact_id: candidate.id,
        job_type: "entretien",
        scheduled_date: cur.toISOString().split("T")[0],
        scheduled_time_start: arrivalTime,
        scheduled_time_end: endTime,
        status: "planifié",
        notes: `Route ${bestDay} — Arrêt #${position}`,
      });
      count++;
      cur.setDate(cur.getDate() + increment);
    }

    if (count === 0) continue;

    results.push(`${name}: assigné au ${bestDay} à ${arrivalTime} (${count} passages, début ${first.toISOString().split("T")[0]})`);

    // 8. Notifier Thomas (PAS le client)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
    const { data: thomas } = await supabaseAdmin.from("contacts").select("id").eq("phone", "+14509942215").single();
    if (thomas) {
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: thomas.id,
          body: `CHLORE: Nouveau client auto-assigné — ${name} le ${bestDay} à ${arrivalTime}. Va sur /routes pour confirmer le SMS.`,
        }),
      });
    }
  }

  return results;
}
