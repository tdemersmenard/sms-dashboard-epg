import { supabaseAdmin } from "@/lib/supabase";

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_TO_JS: Record<string, number> = {
  "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3,
  "Jeudi": 4, "Vendredi": 5, "Samedi": 6,
};

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_KEY}`
    );
    const data = await res.json();
    if (data.results?.[0]) return data.results[0].geometry.location;
    return null;
  } catch { return null; }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Trouve le meilleur jour pour un nouveau client basé sur proximité + charge
async function findBestDay(clientLat: number, clientLng: number): Promise<{ day: string; position: number; arrivalTime: string }> {
  // Chercher les entretiens existants groupés par jour de la semaine
  const { data: existingJobs } = await supabaseAdmin
    .from("jobs")
    .select("contact_id, scheduled_date, scheduled_time_start, notes")
    .eq("job_type", "entretien")
    .eq("status", "planifié")
    .gte("scheduled_date", new Date().toISOString().split("T")[0])
    .order("scheduled_date", { ascending: true });

  // Grouper par jour de la semaine (basé sur le notes "Route Lundi" etc.)
  const dayLoads: Record<string, { count: number; clients: Array<{ lat: number; lng: number; contactId: string }> }> = {};
  for (const d of DAYS) {
    dayLoads[d] = { count: 0, clients: [] };
  }

  // Trouver le jour de chaque job existant depuis les notes
  const processedContacts = new Set<string>();
  for (const job of existingJobs || []) {
    if (processedContacts.has(job.contact_id)) continue;
    processedContacts.add(job.contact_id);

    const routeMatch = job.notes?.match(/Route (\w+)/);
    if (routeMatch && dayLoads[routeMatch[1]]) {
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("address, city")
        .eq("id", job.contact_id)
        .single();

      if (contact?.address) {
        const fullAddr = contact.city ? `${contact.address}, ${contact.city}, QC, Canada` : `${contact.address}, Granby, QC, Canada`;
        const geo = await geocode(fullAddr);
        if (geo) {
          dayLoads[routeMatch[1]].count++;
          dayLoads[routeMatch[1]].clients.push({ lat: geo.lat, lng: geo.lng, contactId: job.contact_id });
        }
      }
    }
  }

  // Score chaque jour: proximité aux clients existants + charge
  let bestDay = "Lundi";
  let bestScore = Infinity;

  for (const [day, load] of Object.entries(dayLoads)) {
    // Pénalité pour charge (plus de clients = moins bon)
    const chargePenalty = load.count * 10;

    // Bonus pour proximité (plus proche des clients existants = mieux)
    let proxScore = 0;
    if (load.clients.length > 0) {
      const avgDist = load.clients.reduce((sum, c) => sum + haversine(clientLat, clientLng, c.lat, c.lng), 0) / load.clients.length;
      proxScore = avgDist;
    } else {
      proxScore = 20; // Jour vide = score neutre
    }

    const totalScore = proxScore + chargePenalty;
    if (totalScore < bestScore && load.count < 5) { // Max 5 par jour
      bestScore = totalScore;
      bestDay = day;
    }
  }

  // Calculer la position et l'heure d'arrivée
  const position = dayLoads[bestDay].count + 1;
  const baseMinutes = 8 * 60; // 08:00
  const arrivalMinutes = baseMinutes + (position - 1) * 60; // 60 min entre chaque (45 service + 15 transport)
  const arrivalTime = `${String(Math.floor(arrivalMinutes / 60)).padStart(2, "0")}:${String(arrivalMinutes % 60).padStart(2, "0")}`;

  return { day: bestDay, position, arrivalTime };
}

// Assigner automatiquement un client aux routes et créer ses jobs
export async function autoAssignClient(contactId: string): Promise<string> {
  // Vérifier que le client a entretien + adresse + ouverture
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, address, city, services, ouverture_date")
    .eq("id", contactId)
    .single();

  if (!contact) return "Contact non trouvé";

  const services = contact.services || [];
  if (!services.some((s: string) => s.toLowerCase().includes("entretien"))) {
    return "Pas un client d'entretien";
  }
  if (!contact.address || contact.address.length < 5) {
    return "Pas d'adresse valide";
  }

  if (!contact.ouverture_date) {
    return "Pas de date d'ouverture planifiée";
  }

  // Vérifier qu'il n'a pas déjà des entretiens planifiés
  const { data: existingEntretiens } = await supabaseAdmin
    .from("jobs")
    .select("id")
    .eq("contact_id", contactId)
    .eq("job_type", "entretien")
    .limit(1);

  if (existingEntretiens && existingEntretiens.length > 0) {
    return "Des entretiens existent déjà pour ce client";
  }

  // Géocoder l'adresse
  const fullAddr = contact.city ? `${contact.address}, ${contact.city}, QC, Canada` : `${contact.address}, Granby, QC, Canada`;
  const geo = await geocode(fullAddr);
  if (!geo) return "Impossible de géocoder l'adresse";

  // Trouver le meilleur jour
  const { day, position, arrivalTime } = await findBestDay(geo.lat, geo.lng);
  const targetDayOfWeek = DAY_TO_JS[day];

  // Premier entretien = 7 jours après l'ouverture, ajusté au bon jour
  const ouvertureDate = new Date(contact.ouverture_date + "T12:00:00");
  const firstEntretien = new Date(ouvertureDate);
  firstEntretien.setDate(firstEntretien.getDate() + 7);
  while (firstEntretien.getDay() !== targetDayOfWeek) {
    firstEntretien.setDate(firstEntretien.getDate() + 1);
  }

  // Créer les jobs hebdomadaires jusqu'au 30 septembre
  const endDate = new Date("2026-09-30T23:59:59");
  const currentDate = new Date(firstEntretien);
  let jobCount = 0;

  const endTimeMinutes = parseInt(arrivalTime.split(":")[0]) * 60 + parseInt(arrivalTime.split(":")[1]) + 45;
  const endTime = `${String(Math.floor(endTimeMinutes / 60)).padStart(2, "0")}:${String(endTimeMinutes % 60).padStart(2, "0")}`;

  while (currentDate <= endDate) {
    await supabaseAdmin.from("jobs").insert({
      contact_id: contactId,
      job_type: "entretien",
      scheduled_date: currentDate.toISOString().split("T")[0],
      scheduled_time_start: arrivalTime,
      scheduled_time_end: endTime,
      status: "planifié",
      notes: `Route ${day} — Arrêt #${position}`,
    });
    jobCount++;
    currentDate.setDate(currentDate.getDate() + 7);
  }

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  console.log(`[auto-assign] ${name}: ${jobCount} passages chaque ${day}, début ${firstEntretien.toISOString().split("T")[0]}`);

  return `${name}: ${jobCount} passages chaque ${day}, arrivée ~${arrivalTime}, début ${firstEntretien.toISOString().split("T")[0]}`;
}

// Vérifier et assigner automatiquement tous les clients qui n'ont pas encore de route
export async function checkAndAutoAssign(): Promise<string[]> {
  const results: string[] = [];

  // Trouver tous les clients entretien sans jobs d'entretien
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, services, address, ouverture_date")
    .not("services", "is", null);

  for (const contact of contacts || []) {
    const services = contact.services || [];
    if (!services.some((s: string) => s.toLowerCase().includes("entretien"))) continue;
    if (!contact.address || contact.address.length < 5) continue;
    if (!contact.ouverture_date) continue;

    // A-t-il déjà des entretiens?
    const { data: existing } = await supabaseAdmin
      .from("jobs")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("job_type", "entretien")
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Tout est bon — auto-assigner
    const result = await autoAssignClient(contact.id);
    results.push(result);
  }

  return results;
}
