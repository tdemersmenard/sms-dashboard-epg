export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const HOME_ADDRESS = "86 rue de Windsor, Granby, QC, Canada";

interface GeocodedClient {
  id: string;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  frequency: string;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_KEY}`
    );
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].geometry.location;
    }
    return null;
  } catch {
    return null;
  }
}

async function getDrivingInfo(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ distanceKm: number; durationMin: number }> {
  try {
    const origin = `${originLat},${originLng}`;
    const dest = `${destLat},${destLng}`;
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${dest}&mode=driving&key=${GOOGLE_MAPS_KEY}`
    );
    const data = await res.json();
    const element = data.rows?.[0]?.elements?.[0];
    if (element?.status === "OK") {
      return {
        distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
        durationMin: Math.round(element.duration.value / 60),
      };
    }
  } catch {
    // fall through to haversine fallback
  }
  const dist = haversine(originLat, originLng, destLat, destLng);
  return {
    distanceKm: Math.round(dist * 10) / 10,
    durationMin: Math.round((dist / 40) * 60),
  };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function optimizeRoute(clients: GeocodedClient[], homeLat: number, homeLng: number): GeocodedClient[] {
  if (clients.length <= 1) return clients;

  const ordered: GeocodedClient[] = [];
  const remaining = [...clients];
  let currentLat = homeLat;
  let currentLng = homeLng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversine(currentLat, currentLng, remaining[i].lat, remaining[i].lng);
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    }
    const nearest = remaining.splice(nearestIdx, 1)[0];
    ordered.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return ordered;
}

function clusterClients(
  clients: GeocodedClient[],
  maxPerDay: number,
  daysAvailable: string[]
): Record<string, GeocodedClient[]> {
  const days: Record<string, GeocodedClient[]> = {};
  for (const day of daysAvailable) days[day] = [];

  const sorted = [...clients].sort((a, b) => a.lat - b.lat);
  let dayIdx = 0;

  for (const client of sorted) {
    const dayName = daysAvailable[dayIdx % daysAvailable.length];
    if (days[dayName].length >= maxPerDay) dayIdx++;
    const targetDay = daysAvailable[dayIdx % daysAvailable.length];
    days[targetDay].push(client);
    if (days[targetDay].length >= maxPerDay) dayIdx++;
  }

  // 5 swap-improvement iterations
  for (let iteration = 0; iteration < 5; iteration++) {
    for (const day1 of daysAvailable) {
      for (const day2 of daysAvailable) {
        if (day1 === day2) continue;
        if (!days[day1].length || !days[day2].length) continue;
        for (let i = 0; i < days[day1].length; i++) {
          for (let j = 0; j < days[day2].length; j++) {
            const c1 = days[day1][i];
            const c2 = days[day2][j];
            const avg = (arr: GeocodedClient[], ref: GeocodedClient) =>
              arr.reduce((s, c) => s + haversine(ref.lat, ref.lng, c.lat, c.lng), 0) / arr.length;
            if (avg(days[day2], c1) < avg(days[day1], c1) && avg(days[day1], c2) < avg(days[day2], c2)) {
              days[day1][i] = c2;
              days[day2][j] = c1;
            }
          }
        }
      }
    }
  }

  return days;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const daysAvailable: string[] = body.days || ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
    const maxPerDay: number = body.maxPerDay || 5;
    const startTime: string = body.startTime || "08:00";
    const fuelConsumptionPer100km: number = body.fuelPer100km || 9;
    const fuelPricePerLitre: number = body.fuelPricePerLitre || 1.65;

    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, address, city, services, season_price")
      .not("services", "is", null);

    const entretienClients = (contacts || []).filter(c => {
      const services = c.services || [];
      return services.some((s: string) => s.toLowerCase().includes("entretien"));
    });

    if (entretienClients.length === 0) {
      return NextResponse.json({ error: "Aucun client avec entretien trouvé" }, { status: 404 });
    }

    const clientsWithAddress = entretienClients.filter(c =>
      c.address &&
      c.address.length > 5
    );

    const homeGeo = await geocode(HOME_ADDRESS);
    if (!homeGeo) {
      return NextResponse.json({ error: "Impossible de géocoder l'adresse de base" }, { status: 500 });
    }

    const geocodedClients: GeocodedClient[] = [];
    for (const client of clientsWithAddress) {
      const fullAddress = client.city
        ? `${client.address}, ${client.city}, QC, Canada`
        : `${client.address}, Granby, QC, Canada`;
      const geo = await geocode(fullAddress);
      if (geo) {
        const name = [client.first_name, client.last_name].filter(Boolean).join(" ") || client.phone;
        geocodedClients.push({
          id: client.id,
          name,
          phone: client.phone,
          address: client.address + (client.city ? `, ${client.city}` : ""),
          lat: geo.lat,
          lng: geo.lng,
          frequency: "hebdomadaire",
        });
      }
    }

    const clusters = clusterClients(geocodedClients, maxPerDay, daysAvailable);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const optimizedRoutes: Record<string, any> = {};
    let totalDistanceKm = 0;
    let totalDurationMin = 0;

    const [startH, startM] = startTime.split(":").map(Number);

    for (const [day, clients] of Object.entries(clusters)) {
      if (clients.length === 0) continue;

      const optimized = optimizeRoute(clients, homeGeo.lat, homeGeo.lng);

      let dayDistanceKm = 0;
      let dayDurationMin = 0;
      let currentMinutes = startH * 60 + startM;
      let prevLat = homeGeo.lat;
      let prevLng = homeGeo.lng;

      const stops = [];
      for (let idx = 0; idx < optimized.length; idx++) {
        const client = optimized[idx];
        const leg = await getDrivingInfo(prevLat, prevLng, client.lat, client.lng);
        dayDistanceKm += leg.distanceKm;
        dayDurationMin += leg.durationMin;
        currentMinutes += leg.durationMin;

        const arrivalTime = `${String(Math.floor(currentMinutes / 60)).padStart(2, "0")}:${String(currentMinutes % 60).padStart(2, "0")}`;
        const departureMinutes = currentMinutes + 45;
        const departureTime = `${String(Math.floor(departureMinutes / 60)).padStart(2, "0")}:${String(departureMinutes % 60).padStart(2, "0")}`;

        stops.push({
          order: idx + 1,
          ...client,
          distanceFromPrev: leg.distanceKm,
          drivingTimeFromPrev: leg.durationMin,
          estimatedArrival: arrivalTime,
          estimatedDeparture: departureTime,
        });

        currentMinutes = departureMinutes;
        prevLat = client.lat;
        prevLng = client.lng;
      }

      // Return home leg
      const returnLeg = optimized.length > 0
        ? await getDrivingInfo(prevLat, prevLng, homeGeo.lat, homeGeo.lng)
        : { distanceKm: 0, durationMin: 0 };
      dayDistanceKm += returnLeg.distanceKm;
      dayDurationMin += returnLeg.durationMin + stops.length * 45;

      const endMinutes = currentMinutes + returnLeg.durationMin;
      const estimatedEndTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

      totalDistanceKm += dayDistanceKm;
      totalDurationMin += dayDurationMin;

      optimizedRoutes[day] = {
        clients: stops,
        totalDistanceKm: Math.round(dayDistanceKm * 10) / 10,
        totalDurationMin: dayDurationMin,
        estimatedEndTime,
        returnHomeKm: returnLeg.distanceKm,
        returnHomeMin: returnLeg.durationMin,
      };
    }

    const weeksInSeason = 24; // ~late April to late September
    const fuelLitresPerWeek = (totalDistanceKm * fuelConsumptionPer100km) / 100;
    const fuelCostPerWeek = fuelLitresPerWeek * fuelPricePerLitre;
    const fuelCostSeason = fuelCostPerWeek * weeksInSeason;

    return NextResponse.json({
      home: { address: HOME_ADDRESS, ...homeGeo },
      routes: optimizedRoutes,
      totalClients: geocodedClients.length,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      clientsWithoutAddress: entretienClients.length - clientsWithAddress.length,
      fuel: {
        litresPerWeek: Math.round(fuelLitresPerWeek * 10) / 10,
        costPerWeek: Math.round(fuelCostPerWeek * 100) / 100,
        costSeason: Math.round(fuelCostSeason * 100) / 100,
        per100km: fuelConsumptionPer100km,
        pricePerLitre: fuelPricePerLitre,
      },
    });
  } catch (err) {
    console.error("[routes] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
