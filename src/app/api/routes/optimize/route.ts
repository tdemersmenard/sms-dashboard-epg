export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const GMAPS = process.env.GOOGLE_MAPS_API_KEY!;
const HOME_ADDR = "86 rue de Windsor, Granby, QC, Canada";

async function geocode(addr: string) {
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GMAPS}`);
  const data = await res.json();
  return data.results?.[0]?.geometry?.location || null;
}

async function drivingInfo(lat1: number, lng1: number, lat2: number, lng2: number) {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lng1}&destinations=${lat2},${lng2}&mode=driving&key=${GMAPS}`);
    const data = await res.json();
    const el = data.rows?.[0]?.elements?.[0];
    if (el?.status === "OK") return { km: Math.round(el.distance.value / 100) / 10, min: Math.round(el.duration.value / 60) };
  } catch {} // eslint-disable-line no-empty
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const days = body.days || ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
    const maxPerDay = body.maxPerDay || 5;
    const startTime = body.startTime || "08:00";
    const fuelPer100 = body.fuelPer100km || 9;
    const fuelPrice = body.fuelPricePerLitre || 1.65;

    const homeGeo = await geocode(HOME_ADDR);
    if (!homeGeo) return NextResponse.json({ error: "Impossible de géocoder l'adresse de base" }, { status: 500 });

    const { data: allContacts } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, address, city, services, ouverture_date, pool_type")
      .not("services", "is", null);

    const entretienClients = (allContacts || []).filter(c =>
      (c.services || []).some((s: string) => s.toLowerCase().includes("entretien") || s.toLowerCase().includes("spa"))
    );

    const problems = {
      noAddress: [] as string[],
      noOuverture: [] as string[],
      failedGeocode: [] as string[],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geocoded: any[] = [];
    for (const c of entretienClients) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone;

      if (!c.address || c.address.length < 5) {
        problems.noAddress.push(name);
        continue;
      }
      if (!c.ouverture_date) {
        problems.noOuverture.push(name);
      }

      const addr = c.city && !c.address.toLowerCase().includes(c.city.toLowerCase())
        ? `${c.address}, ${c.city}, QC, Canada`
        : `${c.address}, Granby, QC, Canada`;
      const geo = await geocode(addr);

      if (!geo) {
        problems.failedGeocode.push(`${name} (${c.address})`);
        continue;
      }

      geocoded.push({
        id: c.id, name, phone: c.phone,
        address: c.address + (c.city && !c.address.includes(c.city) ? `, ${c.city}` : ""),
        lat: geo.lat, lng: geo.lng, ouvertureDate: c.ouverture_date,
        isBiweekly: (c.services || []).some((s: string) => s.includes("2 semaines")),
      });
    }

    // Clustering: distribuer les clients par jour (proximité + charge)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dayBuckets: Record<string, any[]> = {};
    for (const d of days) dayBuckets[d] = [];

    const sorted = [...geocoded].sort((a, b) => a.lat - b.lat);

    for (const client of sorted) {
      let bestDay = days[0];
      let bestScore = Infinity;

      for (const d of days) {
        if (dayBuckets[d].length >= maxPerDay) continue;
        const load = dayBuckets[d].length;
        let proximity = 50;
        if (load > 0) {
          let totalDist = 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const existing of dayBuckets[d]) {
            const dlat = client.lat - existing.lat;
            const dlng = client.lng - existing.lng;
            totalDist += Math.sqrt(dlat * dlat + dlng * dlng);
          }
          proximity = (totalDist / load) * 1000;
        }
        const score = proximity + load * 20;
        if (score < bestScore) { bestScore = score; bestDay = d; }
      }
      dayBuckets[bestDay].push(client);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routes: Record<string, any> = {};
    let totalKm = 0;

    for (const [day, clients] of Object.entries(dayBuckets)) {
      if (clients.length === 0) continue;

      // Nearest neighbor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ordered: any[] = [];
      const remaining = [...clients];
      let curLat = homeGeo.lat, curLng = homeGeo.lng;
      while (remaining.length > 0) {
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const dlat = remaining[i].lat - curLat;
          const dlng = remaining[i].lng - curLng;
          const d = Math.sqrt(dlat * dlat + dlng * dlng);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const next = remaining.splice(bestIdx, 1)[0];
        ordered.push(next);
        curLat = next.lat;
        curLng = next.lng;
      }

      let dayKm = 0, dayMin = 0;
      let prevLat = homeGeo.lat, prevLng = homeGeo.lng;
      const [startH, startM] = startTime.split(":").map(Number);
      let curMinutes = startH * 60 + startM;
      const SERVICE_DURATION = 60;

      const stops = [];
      for (let i = 0; i < ordered.length; i++) {
        const c = ordered[i];
        const drive = await drivingInfo(prevLat, prevLng, c.lat, c.lng);
        const driveKm = drive?.km ?? 5;
        const driveMin = drive?.min ?? 10;

        dayKm += driveKm;
        dayMin += driveMin;
        curMinutes += driveMin;

        const arrival = `${String(Math.floor(curMinutes / 60)).padStart(2, "0")}:${String(curMinutes % 60).padStart(2, "0")}`;
        curMinutes += SERVICE_DURATION;
        const departure = `${String(Math.floor(curMinutes / 60)).padStart(2, "0")}:${String(curMinutes % 60).padStart(2, "0")}`;
        dayMin += SERVICE_DURATION;

        let firstEntretien: string | null = null;
        if (c.ouvertureDate) {
          const dayToJS: Record<string, number> = { Dimanche: 0, Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6 };
          const target = dayToJS[day];
          const first = new Date(c.ouvertureDate + "T12:00:00");
          first.setDate(first.getDate() + 7);
          if (target !== undefined) {
            while (first.getDay() !== target) first.setDate(first.getDate() + 1);
          }
          firstEntretien = first.toISOString().split("T")[0];
        }

        stops.push({
          order: i + 1, id: c.id, name: c.name, phone: c.phone, address: c.address,
          lat: c.lat, lng: c.lng, distKm: driveKm, driveMin,
          arrival, departure, ouvertureDate: c.ouvertureDate, firstEntretien, isBiweekly: c.isBiweekly,
        });

        prevLat = c.lat;
        prevLng = c.lng;
      }

      const returnDrive = await drivingInfo(prevLat, prevLng, homeGeo.lat, homeGeo.lng);
      const returnKm = returnDrive?.km ?? 5;
      const returnMin = returnDrive?.min ?? 10;
      dayKm += returnKm;
      dayMin += returnMin;
      curMinutes += returnMin;
      totalKm += dayKm;

      routes[day] = {
        clients: stops,
        totalKm: Math.round(dayKm * 10) / 10,
        totalMin: dayMin,
        endTime: `${String(Math.floor(curMinutes / 60)).padStart(2, "0")}:${String(curMinutes % 60).padStart(2, "0")}`,
        returnKm, returnMin,
      };
    }

    const wkKm = Math.round(totalKm * 10) / 10;
    const wkL = Math.round(wkKm * fuelPer100 / 100 * 10) / 10;
    const wkCost = Math.round(wkL * fuelPrice * 100) / 100;

    return NextResponse.json({
      routes, totalClients: geocoded.length, totalKm: wkKm, problems,
      fuel: { wkKm, wkL, wkCost, seasonCost: Math.round(wkCost * 22 * 100) / 100 },
    });
  } catch (err) {
    console.error("[routes] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
