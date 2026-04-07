import { supabaseAdmin } from "@/lib/supabase";

const GMAPS = process.env.GOOGLE_MAPS_API_KEY!;
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

  // 1. Trouver les clients candidats
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, address, city, services, ouverture_date")
    .not("services", "is", null);

  const candidates = (contacts || []).filter(c => {
    const svcs = c.services || [];
    return svcs.some((s: string) => s.toLowerCase().includes("entretien")) && c.address && c.address.length > 5 && c.ouverture_date;
  });

  if (candidates.length === 0) return [];

  // 2. Lire le route_state existant
  const { data: routeState } = await supabaseAdmin.from("route_state").select("data").eq("id", 1).single();
  if (!routeState?.data?.routes) {
    return ["No route_state — calcule d'abord les routes manuellement sur /routes"];
  }

  const routes = routeState.data.routes;
  const existingClientIds = new Set<string>();
  for (const r of routes) {
    for (const s of r.stops) existingClientIds.add(s.id);
  }

  // 3. Pour chaque candidat pas encore dans le route_state
  let updated = false;

  for (const candidate of candidates) {
    if (existingClientIds.has(candidate.id)) continue;

    const fullAddr = candidate.city && !candidate.address.toLowerCase().includes(candidate.city.toLowerCase())
      ? `${candidate.address}, ${candidate.city}, QC, Canada`
      : `${candidate.address}, Granby, QC, Canada`;
    const geo = await geocode(fullAddr);
    if (!geo) continue;

    const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || candidate.phone || "?";
    const isBiweekly = (candidate.services || []).some((s: string) => s.includes("2 semaines"));

    // Trouver le meilleur jour basé sur le route_state existant
    let bestDay = DAYS[0];
    let bestScore = Infinity;

    for (const d of DAYS) {
      const dayRoute = routes.find((r: any) => r.day === d);
      const stops = dayRoute?.stops || [];
      if (stops.length >= MAX_PER_DAY) continue;

      let prox = 50;
      if (stops.length > 0) {
        let totalDist = 0;
        for (const s of stops) {
          const dlat = geo.lat - s.lat;
          const dlng = geo.lng - s.lng;
          totalDist += Math.sqrt(dlat * dlat + dlng * dlng);
        }
        prox = (totalDist / stops.length) * 1000;
      }
      const score = prox + stops.length * 20;
      if (score < bestScore) { bestScore = score; bestDay = d; }
    }

    // Calculer position et heure
    const dayRouteIdx = routes.findIndex((r: any) => r.day === bestDay);
    const dayStops = dayRouteIdx >= 0 ? routes[dayRouteIdx].stops : [];
    const position = dayStops.length + 1;
    const startMinutes = 8 * 60 + (position - 1) * 60;
    const arrivalTime = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
    const endMinutes = startMinutes + 60;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    // Premier entretien
    const target = DAY_TO_JS[bestDay];
    const ouv = new Date(candidate.ouverture_date + "T12:00:00");
    const first = new Date(ouv);
    first.setDate(first.getDate() + 7);
    while (first.getDay() !== target) first.setDate(first.getDate() + 1);

    // Ajouter au route_state (PAS de jobs créés!)
    const newStop = {
      id: candidate.id,
      name,
      phone: candidate.phone,
      address: candidate.address + (candidate.city && !candidate.address.toLowerCase().includes(candidate.city.toLowerCase()) ? `, ${candidate.city}` : ""),
      lat: geo.lat,
      lng: geo.lng,
      ouvertureDate: candidate.ouverture_date,
      isBiweekly,
      order: position,
      arrivalTime,
      departureTime: endTime,
      distFromPrev: 0,
      driveMinFromPrev: 0,
      firstEntretienDate: first.toISOString().split("T")[0],
    };

    if (dayRouteIdx >= 0) {
      routes[dayRouteIdx].stops.push(newStop);
    } else {
      routes.push({
        day: bestDay,
        stops: [newStop],
        totalKm: 0,
        totalMin: 60,
        endTime,
        returnHomeKm: 0,
        returnHomeMin: 0,
      });
    }

    existingClientIds.add(candidate.id);
    updated = true;
    results.push(`${name}: ajouté au ${bestDay} à ${arrivalTime}`);

    // Notifier Thomas (UNE notif par client)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
    const { data: thomas } = await supabaseAdmin.from("contacts").select("id").eq("phone", "+14509942215").single();
    if (thomas) {
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: thomas.id,
          body: `CHLORE: Nouveau client ajouté aux routes — ${name} le ${bestDay} à ${arrivalTime}. Va sur /routes pour confirmer.`,
        }),
      });
    }
  }

  // Sauvegarder le route_state mis à jour
  if (updated) {
    await supabaseAdmin.from("route_state").update({
      data: { ...routeState.data, routes },
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
  }

  return results;
}
