export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const HOME = { address: "86 rue de Windsor, Granby, QC, Canada", lat: 0, lng: 0 };

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_KEY}`);
    const data = await res.json();
    if (data.results?.[0]) return data.results[0].geometry.location;
    return null;
  } catch { return null; }
}

async function getDrivingInfo(lat1: number, lng1: number, lat2: number, lng2: number): Promise<{ km: number; min: number }> {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lng1}&destinations=${lat2},${lng2}&mode=driving&language=fr&key=${GOOGLE_MAPS_KEY}`);
    const data = await res.json();
    const el = data.rows?.[0]?.elements?.[0];
    if (el?.status === "OK") {
      return { km: Math.round(el.distance.value / 100) / 10, min: Math.round(el.duration.value / 60) };
    }
  } catch {} // eslint-disable-line no-empty
  // Fallback haversine
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const km = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  return { km, min: Math.round(km * 1.5) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nearestNeighbor(clients: any[], homeLat: number, homeLng: number) {
  if (clients.length <= 1) return clients;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordered: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remaining = [...clients];
  let curLat = homeLat, curLng = homeLng;
  while (remaining.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const R = 6371;
      const dLat = (remaining[i].lat - curLat) * Math.PI / 180;
      const dLng = (remaining[i].lng - curLng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(curLat * Math.PI / 180) * Math.cos(remaining[i].lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    curLat = next.lat;
    curLng = next.lng;
  }
  return ordered;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const daysAvailable = body.days || ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
    const maxPerDay = body.maxPerDay || 5;
    const startTime = body.startTime || "08:00";
    const fuelPer100 = body.fuelPer100km || 9;
    const fuelPriceL = body.fuelPricePerLitre || 1.65;

    // Fetch TOUS les clients avec entretien
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, address, city, services, ouverture_date")
      .not("services", "is", null);

    const entretienClients = (contacts || []).filter(c => {
      const svcs = c.services || [];
      return svcs.some((s: string) => s.toLowerCase().includes("entretien"));
    });

    // Séparer les clients avec/sans adresse
    const withAddress = entretienClients.filter(c => c.address && c.address.length > 5);
    const withoutAddress = entretienClients.filter(c => !c.address || c.address.length < 5);
    const withoutOuverture = withAddress.filter(c => !c.ouverture_date);

    // Geocode home
    const homeGeo = await geocode(HOME.address);
    if (!homeGeo) return NextResponse.json({ error: "Impossible de géocoder l'adresse de base" }, { status: 500 });
    HOME.lat = homeGeo.lat;
    HOME.lng = homeGeo.lng;

    // Geocode tous les clients
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geocoded: any[] = [];
    const failedGeocode: string[] = [];

    for (const c of withAddress) {
      const fullAddr = c.city && !c.address.toLowerCase().includes(c.city.toLowerCase())
        ? `${c.address}, ${c.city}, QC, Canada`
        : `${c.address}, QC, Canada`;
      const geo = await geocode(fullAddr);
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone;
      if (geo) {
        geocoded.push({ id: c.id, name, phone: c.phone, address: c.address + (c.city ? `, ${c.city}` : ""), lat: geo.lat, lng: geo.lng, ouvertureDate: c.ouverture_date });
      } else {
        failedGeocode.push(`${name} (${c.address})`);
      }
    }

    // Cluster par proximité + charge
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const days: Record<string, any[]> = {};
    for (const d of daysAvailable) days[d] = [];

    // Trier par latitude pour grouper géographiquement
    geocoded.sort((a, b) => a.lat - b.lat);

    // Distribuer uniformément
    for (let i = 0; i < geocoded.length; i++) {
      let bestDay = daysAvailable[0];
      let bestScore = Infinity;
      for (const d of daysAvailable) {
        if (days[d].length >= maxPerDay) continue;
        const loadPenalty = days[d].length * 5;
        let proxBonus = 0;
        if (days[d].length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const avgLat = days[d].reduce((s: number, c: any) => s + c.lat, 0) / days[d].length;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const avgLng = days[d].reduce((s: number, c: any) => s + c.lng, 0) / days[d].length;
          proxBonus = Math.abs(geocoded[i].lat - avgLat) + Math.abs(geocoded[i].lng - avgLng);
        }
        const score = loadPenalty + proxBonus * 100;
        if (score < bestScore) { bestScore = score; bestDay = d; }
      }
      days[bestDay].push(geocoded[i]);
    }

    // Optimiser l'ordre de chaque jour + calculer les vrais trajets
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routes: Record<string, any> = {};
    let totalKm = 0;

    for (const [day, clients] of Object.entries(days)) {
      if (clients.length === 0) continue;

      const optimized = nearestNeighbor(clients, HOME.lat, HOME.lng);
      let dayKm = 0, dayMin = 0;
      let prevLat = HOME.lat, prevLng = HOME.lng;
      const [startH, startM] = startTime.split(":").map(Number);
      let curMin = startH * 60 + startM;

      const stops = [];
      for (let i = 0; i < optimized.length; i++) {
        const c = optimized[i];
        const driving = await getDrivingInfo(prevLat, prevLng, c.lat, c.lng);
        dayKm += driving.km;
        dayMin += driving.min;
        curMin += driving.min;

        const arrival = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
        curMin += 45;
        const departure = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
        dayMin += 45;

        // Calculer premier entretien
        let firstEntretien: string | null = null;
        if (c.ouvertureDate) {
          const ouv = new Date(c.ouvertureDate + "T12:00:00");
          const first = new Date(ouv);
          first.setDate(first.getDate() + 7);
          const dayToJS: Record<string, number> = { "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3, "Jeudi": 4, "Vendredi": 5, "Samedi": 6 };
          const target = dayToJS[day];
          if (target !== undefined) {
            while (first.getDay() !== target) first.setDate(first.getDate() + 1);
          }
          firstEntretien = first.toISOString().split("T")[0];
        }

        stops.push({
          order: i + 1, id: c.id, name: c.name, phone: c.phone, address: c.address,
          lat: c.lat, lng: c.lng,
          distanceFromPrev: driving.km, drivingTimeFromPrev: driving.min,
          estimatedArrival: arrival, estimatedDeparture: departure,
          ouvertureDate: c.ouvertureDate, firstEntretien,
        });

        prevLat = c.lat;
        prevLng = c.lng;
      }

      // Retour maison
      const returnDriving = await getDrivingInfo(prevLat, prevLng, HOME.lat, HOME.lng);
      dayKm += returnDriving.km;
      dayMin += returnDriving.min;
      curMin += returnDriving.min;

      totalKm += dayKm;

      routes[day] = {
        clients: stops,
        totalDistanceKm: Math.round(dayKm * 10) / 10,
        totalDurationMin: dayMin,
        estimatedEndTime: `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`,
        returnHomeKm: returnDriving.km,
        returnHomeMin: returnDriving.min,
      };
    }

    const weeklyKm = Math.round(totalKm * 10) / 10;
    const weeklyL = Math.round(weeklyKm * fuelPer100 / 100 * 10) / 10;
    const weeklyCost = Math.round(weeklyL * fuelPriceL * 100) / 100;

    return NextResponse.json({
      routes,
      totalClients: geocoded.length,
      totalDistanceKm: weeklyKm,
      clientsWithoutAddress: withoutAddress.map(c => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone),
      clientsWithoutOuverture: withoutOuverture.map(c => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone),
      failedGeocode,
      fuel: { weeklyDistanceKm: weeklyKm, weeklyFuelLitres: weeklyL, weeklyFuelCost: weeklyCost, seasonFuelCost: Math.round(weeklyCost * 22 * 100) / 100 },
    });
  } catch (err) {
    console.error("[routes] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
