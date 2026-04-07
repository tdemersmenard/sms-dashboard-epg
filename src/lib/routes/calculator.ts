import { supabaseAdmin } from "@/lib/supabase";

const GMAPS = process.env.GOOGLE_MAPS_API_KEY!;
const HOME_ADDR = "86 rue de Windsor, Granby, QC, Canada";
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const DAY_TO_JS: Record<string, number> = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 };
const MAX_PER_DAY = 5;
const SERVICE_DURATION_MIN = 60;
const START_HOUR = 8;

interface Client {
  id: string;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  ouvertureDate: string;
  isBiweekly: boolean;
}

export interface RouteStop extends Client {
  order: number;
  arrivalTime: string;
  departureTime: string;
  distFromPrev: number;
  driveMinFromPrev: number;
  firstEntretienDate: string;
}

export interface DayRoute {
  day: string;
  stops: RouteStop[];
  totalKm: number;
  totalMin: number;
  endTime: string;
  returnHomeKm: number;
  returnHomeMin: number;
}

async function geocode(addr: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GMAPS}`);
    const data = await res.json();
    return data.results?.[0]?.geometry?.location || null;
  } catch { return null; }
}

async function getDriving(lat1: number, lng1: number, lat2: number, lng2: number): Promise<{ km: number; min: number }> {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lng1}&destinations=${lat2},${lng2}&mode=driving&key=${GMAPS}`);
    const data = await res.json();
    const el = data.rows?.[0]?.elements?.[0];
    if (el?.status === "OK") return { km: Math.round(el.distance.value / 100) / 10, min: Math.round(el.duration.value / 60) };
  } catch {} // eslint-disable-line no-empty
  // Fallback: estimate from straight line
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { km: Math.round(km * 1.5 * 10) / 10, min: Math.round(km * 2.5) };
}

function calcFirstEntretien(ouvertureDate: string, dayName: string): string {
  const target = DAY_TO_JS[dayName];
  const ouv = new Date(ouvertureDate + "T12:00:00");
  const first = new Date(ouv);
  first.setDate(first.getDate() + 7);
  while (first.getDay() !== target) first.setDate(first.getDate() + 1);
  return first.toISOString().split("T")[0];
}

function nearestNeighbor(clients: Client[], homeLat: number, homeLng: number): Client[] {
  if (clients.length <= 1) return clients;
  const result: Client[] = [];
  const remaining = [...clients];
  let curLat = homeLat;
  let curLng = homeLng;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dlat = remaining[i].lat - curLat;
      const dlng = remaining[i].lng - curLng;
      const d = dlat * dlat + dlng * dlng;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    result.push(next);
    curLat = next.lat;
    curLng = next.lng;
  }
  return result;
}

export interface CalculationResult {
  routes: DayRoute[];
  totalClients: number;
  totalKm: number;
  problems: {
    noAddress: string[];
    noOuverture: string[];
    failedGeocode: string[];
  };
  home: { lat: number; lng: number; address: string };
}

export async function calculateRoutes(): Promise<CalculationResult> {
  const homeGeo = await geocode(HOME_ADDR);
  if (!homeGeo) throw new Error("Impossible de géocoder l'adresse de base");

  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, address, city, services, ouverture_date")
    .not("services", "is", null);

  const entretien = (contacts || []).filter(c => {
    const svcs = c.services || [];
    return svcs.some((s: string) => s.toLowerCase().includes("entretien") || s.toLowerCase().includes("spa"));
  });

  const problems = { noAddress: [] as string[], noOuverture: [] as string[], failedGeocode: [] as string[] };
  const valid: Client[] = [];

  for (const c of entretien) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || "?";
    if (!c.address || c.address.length < 5) { problems.noAddress.push(name); continue; }
    if (!c.ouverture_date) { problems.noOuverture.push(name); continue; }

    const fullAddr = c.city && !c.address.toLowerCase().includes(c.city.toLowerCase())
      ? `${c.address}, ${c.city}, QC, Canada`
      : `${c.address}, Granby, QC, Canada`;
    const geo = await geocode(fullAddr);
    if (!geo) { problems.failedGeocode.push(`${name} (${c.address})`); continue; }

    const isBiweekly = (c.services || []).some((s: string) => s.includes("2 semaines"));
    valid.push({
      id: c.id, name, phone: c.phone, address: c.address + (c.city && !c.address.toLowerCase().includes(c.city.toLowerCase()) ? `, ${c.city}` : ""),
      lat: geo.lat, lng: geo.lng, ouvertureDate: c.ouverture_date, isBiweekly,
    });
  }

  // Cluster: distribute by proximity + load
  const buckets: Record<string, Client[]> = {};
  for (const d of DAYS) buckets[d] = [];

  // Sort by latitude for rough geographic grouping
  valid.sort((a, b) => a.lat - b.lat);

  for (const client of valid) {
    let bestDay = DAYS[0];
    let bestScore = Infinity;
    for (const d of DAYS) {
      if (buckets[d].length >= MAX_PER_DAY) continue;
      const load = buckets[d].length;
      let prox = 50;
      if (load > 0) {
        let totalDist = 0;
        for (const ex of buckets[d]) {
          const dlat = client.lat - ex.lat;
          const dlng = client.lng - ex.lng;
          totalDist += Math.sqrt(dlat * dlat + dlng * dlng);
        }
        prox = (totalDist / load) * 1000;
      }
      const score = prox + load * 20;
      if (score < bestScore) { bestScore = score; bestDay = d; }
    }
    buckets[bestDay].push(client);
  }

  // Optimize each day + calculate real driving info
  const routes: DayRoute[] = [];
  let totalKm = 0;

  for (const day of DAYS) {
    if (buckets[day].length === 0) continue;
    const ordered = nearestNeighbor(buckets[day], homeGeo.lat, homeGeo.lng);
    let dayKm = 0;
    let dayMin = 0;
    let prevLat = homeGeo.lat;
    let prevLng = homeGeo.lng;
    let curMin = START_HOUR * 60;

    const stops: RouteStop[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const c = ordered[i];
      const driving = await getDriving(prevLat, prevLng, c.lat, c.lng);
      dayKm += driving.km;
      dayMin += driving.min;
      curMin += driving.min;

      const arrivalTime = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
      curMin += SERVICE_DURATION_MIN;
      const departureTime = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
      dayMin += SERVICE_DURATION_MIN;

      stops.push({
        ...c,
        order: i + 1,
        arrivalTime, departureTime,
        distFromPrev: driving.km,
        driveMinFromPrev: driving.min,
        firstEntretienDate: calcFirstEntretien(c.ouvertureDate, day),
      });

      prevLat = c.lat;
      prevLng = c.lng;
    }

    const returnDriving = await getDriving(prevLat, prevLng, homeGeo.lat, homeGeo.lng);
    dayKm += returnDriving.km;
    dayMin += returnDriving.min;
    curMin += returnDriving.min;
    totalKm += dayKm;

    routes.push({
      day, stops,
      totalKm: Math.round(dayKm * 10) / 10,
      totalMin: dayMin,
      endTime: `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`,
      returnHomeKm: returnDriving.km,
      returnHomeMin: returnDriving.min,
    });
  }

  return {
    routes,
    totalClients: valid.length,
    totalKm: Math.round(totalKm * 10) / 10,
    problems,
    home: { ...homeGeo, address: HOME_ADDR },
  };
}

export async function confirmRoutes(routes: DayRoute[], sendSMS: boolean): Promise<string[]> {
  const results: string[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
  const endDate = new Date("2026-09-30T23:59:59");

  for (const dayRoute of routes) {
    for (const stop of dayRoute.stops) {
      // Supprimer les anciens entretiens planifiés de ce client
      await supabaseAdmin.from("jobs")
        .delete()
        .eq("contact_id", stop.id)
        .eq("job_type", "entretien")
        .eq("status", "planifié");

      const first = new Date(stop.firstEntretienDate + "T12:00:00");
      const cur = new Date(first);
      const increment = stop.isBiweekly ? 14 : 7;
      const endTimeMin = parseInt(stop.arrivalTime.split(":")[0]) * 60 + parseInt(stop.arrivalTime.split(":")[1]) + 60;
      const endTime = `${String(Math.floor(endTimeMin / 60)).padStart(2, "0")}:${String(endTimeMin % 60).padStart(2, "0")}`;

      let count = 0;
      while (cur <= endDate) {
        await supabaseAdmin.from("jobs").insert({
          contact_id: stop.id,
          job_type: "entretien",
          scheduled_date: cur.toISOString().split("T")[0],
          scheduled_time_start: stop.arrivalTime,
          scheduled_time_end: endTime,
          status: "planifié",
          notes: `Route ${dayRoute.day} — Arrêt #${stop.order}`,
        });
        count++;
        cur.setDate(cur.getDate() + increment);
      }

      results.push(`${stop.name}: ${count} passages chaque ${dayRoute.day}, début ${stop.firstEntretienDate}`);

      if (sendSMS && stop.phone?.startsWith("+")) {
        // Check anti-doublon
        const { data: alreadyConfirmed } = await supabaseAdmin
          .from("automation_logs")
          .select("id")
          .eq("action", `route_confirmed_${stop.id}`)
          .limit(1);

        if (alreadyConfirmed && alreadyConfirmed.length > 0) {
          results.push(`${stop.name}: SMS skipé (déjà confirmé)`);
          continue;
        }

        const freq = stop.isBiweekly ? "aux deux semaines" : "chaque semaine";
        const debutStr = new Date(stop.firstEntretienDate + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
        const firstName = stop.name.split(" ")[0];
        await fetch(`${baseUrl}/api/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: stop.id,
            body: `Bonjour ${firstName}! Votre entretien de piscine est planifié ${freq} le ${dayRoute.day.toLowerCase()}, arrivée vers ${stop.arrivalTime}. Premier passage: ${debutStr}. Bonne saison!`,
          }),
        });

        await supabaseAdmin.from("automation_logs").insert({
          action: `route_confirmed_${stop.id}`,
          contact_id: stop.id,
          status: "success",
        });
      }
    }
  }

  return results;
}
