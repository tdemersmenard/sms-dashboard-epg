export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";

const GMAPS = process.env.GOOGLE_MAPS_API_KEY!;
const SERVICE_DURATION = 60;
const START_HOUR = 8;

async function getDriving(lat1: number, lng1: number, lat2: number, lng2: number) {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lng1}&destinations=${lat2},${lng2}&mode=driving&key=${GMAPS}`);
    const data = await res.json();
    const el = data.rows?.[0]?.elements?.[0];
    if (el?.status === "OK") return { km: Math.round(el.distance.value / 100) / 10, min: Math.round(el.duration.value / 60) };
  } catch {} // eslint-disable-line no-empty
  return { km: 5, min: 10 };
}

async function geocode(addr: string) {
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GMAPS}`);
  const data = await res.json();
  return data.results?.[0]?.geometry?.location || null;
}

export async function POST(req: NextRequest) {
  try {
    const { routes } = await req.json();

    const homeGeo = await geocode("86 rue de Windsor, Granby, QC, Canada");
    if (!homeGeo) return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });

    let totalKm = 0;
    const newRoutes = [];

    for (const route of routes) {
      let dayKm = 0;
      let dayMin = 0;
      let prevLat = homeGeo.lat;
      let prevLng = homeGeo.lng;
      let curMin = START_HOUR * 60;

      const newStops = [];
      for (let i = 0; i < route.stops.length; i++) {
        const s = route.stops[i];
        const driving = await getDriving(prevLat, prevLng, s.lat, s.lng);
        dayKm += driving.km;
        dayMin += driving.min;
        curMin += driving.min;

        const arrival = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
        curMin += SERVICE_DURATION;
        const departure = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
        dayMin += SERVICE_DURATION;

        // Recalculate first entretien date based on new day
        const dayToJS: Record<string, number> = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 };
        const target = dayToJS[route.day];
        let firstEntretien = s.firstEntretienDate;
        if (s.ouvertureDate) {
          const ouv = new Date(s.ouvertureDate + "T12:00:00");
          const first = new Date(ouv);
          first.setDate(first.getDate() + 7);
          while (first.getDay() !== target) first.setDate(first.getDate() + 1);
          firstEntretien = first.toISOString().split("T")[0];
        }

        newStops.push({
          ...s,
          order: i + 1,
          arrivalTime: arrival,
          departureTime: departure,
          distFromPrev: driving.km,
          driveMinFromPrev: driving.min,
          firstEntretienDate: firstEntretien,
        });

        prevLat = s.lat;
        prevLng = s.lng;
      }

      // Return home
      const returnDriving = await getDriving(prevLat, prevLng, homeGeo.lat, homeGeo.lng);
      dayKm += returnDriving.km;
      dayMin += returnDriving.min;
      curMin += returnDriving.min;
      totalKm += dayKm;

      newRoutes.push({
        ...route,
        stops: newStops,
        totalKm: Math.round(dayKm * 10) / 10,
        totalMin: dayMin,
        endTime: `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`,
        returnHomeKm: returnDriving.km,
        returnHomeMin: returnDriving.min,
      });
    }

    return NextResponse.json({ routes: newRoutes, totalKm: Math.round(totalKm * 10) / 10 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
