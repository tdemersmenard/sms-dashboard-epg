import { supabaseAdmin } from "@/lib/supabase";

const GMAPS = process.env.GOOGLE_MAPS_API_KEY!;
const HOME_ADDR = "86 rue de Windsor, Granby, QC, Canada";
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
// Après le cégep, tous les jours Lun-Ven sont disponibles
// Pendant le cégep, seulement Mar, Jeu, Ven, Sam, Dim
// L'auto-assign ajoute aux routes existantes donc ça marche déjà
const DAY_TO_JS: Record<string, number> = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 };

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

  const candidates: any[] = [];
  for (const c of contacts || []) {
    const svcs = c.services || [];
    if (!svcs.some((s: string) => s.toLowerCase().includes("entretien"))) continue;
    if (!c.address || c.address.length < 5) continue;
    if (!c.ouverture_date) continue;

    // Vérifier que le client a au moins un payment
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("contact_id", c.id)
      .limit(1);

    if (!payments || payments.length === 0) continue;

    candidates.push(c);
  }

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

    // Calculer le coût actuel de chaque jour
    const dayCost = (stops: any[], homeLat: number, homeLng: number): number => {
      if (stops.length === 0) return 0;
      let total = 0;
      let prevLat = homeLat;
      let prevLng = homeLng;
      for (const s of stops) {
        const dlat = s.lat - prevLat;
        const dlng = s.lng - prevLng;
        total += Math.sqrt(dlat * dlat + dlng * dlng);
        prevLat = s.lat;
        prevLng = s.lng;
      }
      // Retour maison
      const dlat = homeLat - prevLat;
      const dlng = homeLng - prevLng;
      total += Math.sqrt(dlat * dlat + dlng * dlng);
      return total;
    }

    const homeGeoForCalc = await geocode(HOME_ADDR);
    if (!homeGeoForCalc) continue;

    let bestDay = DAYS[0];
    let bestPosition = 0;
    let bestCostIncrease = Infinity;

    for (const d of DAYS) {
      const dayRoute = routes.find((r: any) => r.day === d);
      const stops = dayRoute?.stops || [];
      // Vérifier que la journée n'est pas pleine en temps
      const lastStop = stops[stops.length - 1];
      if (lastStop) {
        const [h, m] = (lastStop.departureTime || "17:00").split(":").map(Number);
        const endMinutes = h * 60 + m;
        // Faut au moins 90 min de libre (1h job + 30min buffer)
        if (endMinutes + 90 > 17 * 60) continue;
      }

      const currentCost = dayCost(stops, homeGeoForCalc.lat, homeGeoForCalc.lng);

      // Tester l'insertion à chaque position possible
      for (let pos = 0; pos <= stops.length; pos++) {
        const newStops = [...stops];
        newStops.splice(pos, 0, { lat: geo.lat, lng: geo.lng, id: candidate.id });
        const newCost = dayCost(newStops, homeGeoForCalc.lat, homeGeoForCalc.lng);
        const increase = newCost - currentCost;

        if (increase < bestCostIncrease) {
          bestCostIncrease = increase;
          bestDay = d;
          bestPosition = pos;
        }
      }
    }

    // Calculer position et heure
    const dayRouteIdx = routes.findIndex((r: any) => r.day === bestDay);
    const position = bestPosition + 1;
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
      routes[dayRouteIdx].stops.splice(bestPosition, 0, newStop);
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

    // Recalculer la journée complète avec les vrais temps Google Maps
    const targetDayIdx = routes.findIndex((r: any) => r.day === bestDay);
    if (targetDayIdx >= 0) {
      const homeGeoForRecalc = await geocode(HOME_ADDR);
      if (homeGeoForRecalc) {
        // Re-optimiser l'ordre avec nearest-neighbor
        const dayStopsToOrder = [...routes[targetDayIdx].stops];
        const ordered: any[] = [];
        const remaining = [...dayStopsToOrder];
        let curLat = homeGeoForRecalc.lat;
        let curLng = homeGeoForRecalc.lng;

        while (remaining.length > 0) {
          let bestIdx = 0;
          let bestD = Infinity;
          for (let i = 0; i < remaining.length; i++) {
            const dlat = remaining[i].lat - curLat;
            const dlng = remaining[i].lng - curLng;
            const d = dlat * dlat + dlng * dlng;
            if (d < bestD) { bestD = d; bestIdx = i; }
          }
          const next = remaining.splice(bestIdx, 1)[0];
          ordered.push(next);
          curLat = next.lat;
          curLng = next.lng;
        }

        // Recalculer les vrais temps via Google Maps
        let dayKm = 0;
        let dayMin = 0;
        let prevLat = homeGeoForRecalc.lat;
        let prevLng = homeGeoForRecalc.lng;
        let curMin = 8 * 60;
        const newStops: any[] = [];

        for (let i = 0; i < ordered.length; i++) {
          const c = ordered[i];

          let driving = { km: 5, min: 10 };
          try {
            const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${prevLat},${prevLng}&destinations=${c.lat},${c.lng}&mode=driving&key=${GMAPS}`);
            const data = await res.json();
            const el = data.rows?.[0]?.elements?.[0];
            if (el?.status === "OK") {
              driving = { km: Math.round(el.distance.value / 100) / 10, min: Math.round(el.duration.value / 60) };
            }
          } catch {}

          dayKm += driving.km;
          dayMin += driving.min;
          curMin += driving.min;

          const arrival = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
          curMin += 60;
          const departure = `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`;
          dayMin += 60;

          newStops.push({
            ...c,
            order: i + 1,
            arrivalTime: arrival,
            departureTime: departure,
            distFromPrev: driving.km,
            driveMinFromPrev: driving.min,
          });

          prevLat = c.lat;
          prevLng = c.lng;
        }

        // Retour maison
        let returnDriving = { km: 5, min: 10 };
        try {
          const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${prevLat},${prevLng}&destinations=${homeGeoForRecalc.lat},${homeGeoForRecalc.lng}&mode=driving&key=${GMAPS}`);
          const data = await res.json();
          const el = data.rows?.[0]?.elements?.[0];
          if (el?.status === "OK") {
            returnDriving = { km: Math.round(el.distance.value / 100) / 10, min: Math.round(el.duration.value / 60) };
          }
        } catch {}

        dayKm += returnDriving.km;
        dayMin += returnDriving.min;
        curMin += returnDriving.min;

        routes[targetDayIdx] = {
          ...routes[targetDayIdx],
          stops: newStops,
          totalKm: Math.round(dayKm * 10) / 10,
          totalMin: dayMin,
          endTime: `${String(Math.floor(curMin / 60)).padStart(2, "0")}:${String(curMin % 60).padStart(2, "0")}`,
          returnHomeKm: returnDriving.km,
          returnHomeMin: returnDriving.min,
        };
      }
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
