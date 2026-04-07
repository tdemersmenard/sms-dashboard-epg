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

interface RouteStop extends Client {
  order: number;
  arrivalTime: string;
  departureTime: string;
  distFromPrev: number;
  driveMinFromPrev: number;
  firstEntretienDate: string;
}

interface DayRoute {
  day: string;
  stops: RouteStop[];
  totalKm: number;
  totalMin: number;
  endTime: string;
  returnHomeKm: number;
  returnHomeMin: number;
}

// ─── HELPERS ───
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocode(addr: string) {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GMAPS}`);
    const data = await res.json();
    return data.results?.[0]?.geometry?.location || null;
  } catch { return null; }
}

// Cache de distances pour éviter de refaire les mêmes calls
const distanceCache = new Map<string, { km: number; min: number }>();

async function getDriving(lat1: number, lng1: number, lat2: number, lng2: number): Promise<{ km: number; min: number }> {
  const key = `${lat1.toFixed(4)},${lng1.toFixed(4)}->${lat2.toFixed(4)},${lng2.toFixed(4)}`;
  if (distanceCache.has(key)) return distanceCache.get(key)!;

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lng1}&destinations=${lat2},${lng2}&mode=driving&key=${GMAPS}`);
    const data = await res.json();
    const el = data.rows?.[0]?.elements?.[0];
    if (el?.status === "OK") {
      const result = { km: Math.round(el.distance.value / 100) / 10, min: Math.round(el.duration.value / 60) };
      distanceCache.set(key, result);
      return result;
    }
  } catch {}

  const km = Math.round(haversine(lat1, lng1, lat2, lng2) * 1.4 * 10) / 10;
  const result = { km, min: Math.round(km * 1.5) };
  distanceCache.set(key, result);
  return result;
}

function calcFirstEntretien(ouvertureDate: string, dayName: string): string {
  const target = DAY_TO_JS[dayName];
  const ouv = new Date(ouvertureDate + "T12:00:00");
  const first = new Date(ouv);
  first.setDate(first.getDate() + 7);
  while (first.getDay() !== target) first.setDate(first.getDate() + 1);
  return first.toISOString().split("T")[0];
}

// ─── CLUSTERING K-MEANS ───
function kMeansCluster(clients: Client[], k: number, iterations: number = 100): Client[][] {
  if (clients.length <= k) return clients.map(c => [c]);

  // Initialisation déterministe: K-means++ basé sur la distance
  // Premier centroïde = client le plus proche du centre géographique
  const centerLat = clients.reduce((s, c) => s + c.lat, 0) / clients.length;
  const centerLng = clients.reduce((s, c) => s + c.lng, 0) / clients.length;

  const centroids: { lat: number; lng: number }[] = [];

  // Premier centroïde: client le plus proche du centre
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < clients.length; i++) {
    const d = haversine(clients[i].lat, clients[i].lng, centerLat, centerLng);
    if (d < closestDist) { closestDist = d; closestIdx = i; }
  }
  centroids.push({ lat: clients[closestIdx].lat, lng: clients[closestIdx].lng });

  // Centroïdes suivants: client le plus loin de tous les centroïdes existants (K-means++)
  while (centroids.length < k) {
    let maxMinDist = -1;
    let maxIdx = 0;
    for (let i = 0; i < clients.length; i++) {
      const minDist = Math.min(...centroids.map(c => haversine(clients[i].lat, clients[i].lng, c.lat, c.lng)));
      if (minDist > maxMinDist) { maxMinDist = minDist; maxIdx = i; }
    }
    centroids.push({ lat: clients[maxIdx].lat, lng: clients[maxIdx].lng });
  }

  let clusters: Client[][] = [];

  for (let iter = 0; iter < iterations; iter++) {
    clusters = Array.from({ length: k }, () => []);

    // Trier les clients par distance au centroïde le plus proche (déterministe)
    const sortedClients = [...clients].sort((a, b) => {
      const distA = Math.min(...centroids.map(c => haversine(a.lat, a.lng, c.lat, c.lng)));
      const distB = Math.min(...centroids.map(c => haversine(b.lat, b.lng, c.lat, c.lng)));
      if (distA !== distB) return distA - distB;
      return a.id.localeCompare(b.id); // Tiebreak déterministe
    });

    for (const client of sortedClients) {
      const distances = centroids.map((c, i) => ({ idx: i, dist: haversine(client.lat, client.lng, c.lat, c.lng) }));
      distances.sort((a, b) => a.dist - b.dist);

      let assigned = false;
      for (const { idx } of distances) {
        if (clusters[idx].length < MAX_PER_DAY) {
          clusters[idx].push(client);
          assigned = true;
          break;
        }
      }
      if (!assigned) clusters[0].push(client);
    }

    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue;
      centroids[i] = {
        lat: clusters[i].reduce((s, c) => s + c.lat, 0) / clusters[i].length,
        lng: clusters[i].reduce((s, c) => s + c.lng, 0) / clusters[i].length,
      };
    }
  }

  return clusters;
}

// ─── 2-OPT pour optimiser l'ordre dans un cluster ───
function twoOptSwap(stops: Client[], homeLat: number, homeLng: number): Client[] {
  if (stops.length < 4) return stops;

  let best = [...stops];
  let bestDist = calculateTourDistance(best, homeLat, homeLng);
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const newRoute = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const newDist = calculateTourDistance(newRoute, homeLat, homeLng);
        if (newDist < bestDist) {
          best = newRoute;
          bestDist = newDist;
          improved = true;
        }
      }
    }
  }

  return best;
}

function calculateTourDistance(stops: Client[], homeLat: number, homeLng: number): number {
  if (stops.length === 0) return 0;
  let total = haversine(homeLat, homeLng, stops[0].lat, stops[0].lng);
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversine(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng);
  }
  total += haversine(stops[stops.length - 1].lat, stops[stops.length - 1].lng, homeLat, homeLng);
  return total;
}

// ─── CROSS-DAY SWAPS pour équilibrer entre jours ───
function crossDaySwaps(clusters: Client[][], homeLat: number, homeLng: number, iterations: number = 50): Client[][] {
  const result = clusters.map(c => [...c]);

  for (let iter = 0; iter < iterations; iter++) {
    let improved = false;

    for (let d1 = 0; d1 < result.length; d1++) {
      for (let d2 = d1 + 1; d2 < result.length; d2++) {
        for (let i = 0; i < result[d1].length; i++) {
          for (let j = 0; j < result[d2].length; j++) {
            // Try swapping clients i and j between days d1 and d2
            const before = calculateTourDistance(result[d1], homeLat, homeLng) + calculateTourDistance(result[d2], homeLat, homeLng);

            const newD1 = [...result[d1]];
            const newD2 = [...result[d2]];
            [newD1[i], newD2[j]] = [newD2[j], newD1[i]];

            const after = calculateTourDistance(newD1, homeLat, homeLng) + calculateTourDistance(newD2, homeLat, homeLng);

            if (after < before - 0.5) { // Significant improvement (>500m)
              result[d1] = newD1;
              result[d2] = newD2;
              improved = true;
            }
          }
        }
      }
    }

    if (!improved) break;
  }

  return result;
}

// ─── MAIN CALCULATOR ───
export interface CalculationResult {
  routes: DayRoute[];
  totalClients: number;
  totalKm: number;
  problems: { noAddress: string[]; noOuverture: string[]; failedGeocode: string[] };
  home: { lat: number; lng: number; address: string };
  fuel: { weeklyFuelLitres: number; weeklyFuelCost: number; seasonFuelCost: number };
}

export async function calculateRoutes(): Promise<CalculationResult> {
  console.log("[routes] Starting optimized calculation...");
  distanceCache.clear();

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

  console.log(`[routes] ${valid.length} valid clients to optimize`);

  // ─── PHASE 1: K-MEANS CLUSTERING ───
  const numDays = DAYS.length;
  let bestClusters = kMeansCluster(valid, numDays, 200);
  let bestTotalDist = bestClusters.reduce((sum, c) => sum + calculateTourDistance(c, homeGeo.lat, homeGeo.lng), 0);
  console.log(`[routes] Phase 1 K-means: ${Math.round(bestTotalDist * 10) / 10} km`);

  // ─── PHASE 2: 2-OPT par jour ───
  bestClusters = bestClusters.map(c => twoOptSwap(c, homeGeo.lat, homeGeo.lng));
  const phase2Dist = bestClusters.reduce((sum, c) => sum + calculateTourDistance(c, homeGeo.lat, homeGeo.lng), 0);
  console.log(`[routes] Phase 2 2-opt: ${Math.round(phase2Dist * 10) / 10} km`);

  // ─── PHASE 3: CROSS-DAY SWAPS ───
  bestClusters = crossDaySwaps(bestClusters, homeGeo.lat, homeGeo.lng, 500);
  // Ré-optimiser chaque jour après les swaps
  bestClusters = bestClusters.map(c => twoOptSwap(c, homeGeo.lat, homeGeo.lng));
  const phase3Dist = bestClusters.reduce((sum, c) => sum + calculateTourDistance(c, homeGeo.lat, homeGeo.lng), 0);
  console.log(`[routes] Phase 3 cross-day: ${Math.round(phase3Dist * 10) / 10} km`);

  // ─── BUILD FINAL ROUTES avec vrais temps Google Maps ───
  const routes: DayRoute[] = [];
  let totalKm = 0;

  for (let dayIdx = 0; dayIdx < numDays; dayIdx++) {
    const day = DAYS[dayIdx];
    const clients = bestClusters[dayIdx] || [];
    if (clients.length === 0) continue;

    let dayKm = 0;
    let dayMin = 0;
    let prevLat = homeGeo.lat;
    let prevLng = homeGeo.lng;
    let curMin = START_HOUR * 60;

    const stops: RouteStop[] = [];
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      const driving = await getDriving(prevLat, prevLng, c.lat, c.lng);
      dayKm += driving.km;
      dayMin += driving.min;
      curMin += driving.min;

      const arrivalTime = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
      curMin += SERVICE_DURATION_MIN;
      const departureTime = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
      dayMin += SERVICE_DURATION_MIN;

      stops.push({
        ...c, order: i + 1, arrivalTime, departureTime,
        distFromPrev: driving.km, driveMinFromPrev: driving.min,
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

  const finalKm = Math.round(totalKm * 10) / 10;
  const fuelL = Math.round(finalKm * 9 / 100 * 10) / 10;
  const fuelCost = Math.round(fuelL * 1.65 * 100) / 100;

  console.log(`[routes] Final: ${finalKm} km, ${fuelL} L, ${fuelCost}$`);

  return {
    routes, totalClients: valid.length, totalKm: finalKm, problems,
    home: { ...homeGeo, address: HOME_ADDR },
    fuel: { weeklyFuelLitres: fuelL, weeklyFuelCost: fuelCost, seasonFuelCost: Math.round(fuelCost * 22 * 100) / 100 },
  };
}

// ─── CONFIRM (inchangé, garde l'ancienne logique) ───
export async function confirmRoutes(routes: DayRoute[], sendSMS: boolean): Promise<string[]> {
  const results: string[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
  const endDate = new Date("2026-09-30T23:59:59");

  for (const dayRoute of routes) {
    for (const stop of dayRoute.stops) {
      await supabaseAdmin.from("jobs").delete().eq("contact_id", stop.id).eq("job_type", "entretien").eq("status", "planifié");

      const first = new Date(stop.firstEntretienDate + "T12:00:00");
      const cur = new Date(first);
      const increment = stop.isBiweekly ? 14 : 7;
      const endTimeMin = parseInt(stop.arrivalTime.split(":")[0]) * 60 + parseInt(stop.arrivalTime.split(":")[1]) + 60;
      const endTime = `${String(Math.floor(endTimeMin / 60)).padStart(2, "0")}:${String(endTimeMin % 60).padStart(2, "0")}`;

      let count = 0;
      while (cur <= endDate) {
        await supabaseAdmin.from("jobs").insert({
          contact_id: stop.id, job_type: "entretien",
          scheduled_date: cur.toISOString().split("T")[0],
          scheduled_time_start: stop.arrivalTime, scheduled_time_end: endTime,
          status: "planifié", notes: `Route ${dayRoute.day} — Arrêt #${stop.order}`,
        });
        count++;
        cur.setDate(cur.getDate() + increment);
      }

      results.push(`${stop.name}: ${count} passages chaque ${dayRoute.day}, début ${stop.firstEntretienDate}`);

      if (sendSMS && stop.phone?.startsWith("+")) {
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
