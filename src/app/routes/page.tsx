"use client";

import { useState } from "react";
import { MapPin, Loader2, AlertCircle, ChevronDown, ChevronUp, Check, Send, Fuel, Clock, CalendarCheck, X } from "lucide-react";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_COLORS: Record<string, string> = {
  Lundi: "bg-blue-500",
  Mardi: "bg-green-500",
  Mercredi: "bg-purple-500",
  Jeudi: "bg-orange-500",
  Vendredi: "bg-pink-500",
  Samedi: "bg-teal-500",
  Dimanche: "bg-red-500",
};
const DAY_OFFSET: Record<string, number> = {
  Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3,
  Vendredi: 4, Samedi: 5, Dimanche: 6,
};

interface RouteClient {
  id: string;
  name: string;
  address: string;
  order: number;
  distanceFromPrev: number;
  drivingTimeFromPrev: number;
  estimatedArrival: string;
  estimatedDeparture: string;
  phone: string;
}

interface DayRoute {
  clients: RouteClient[];
  totalDistanceKm: number;
  totalDurationMin: number;
  estimatedEndTime: string;
  returnHomeKm: number;
  returnHomeMin: number;
}

interface FuelStats {
  litresPerWeek: number;
  costPerWeek: number;
  costSeason: number;
  per100km: number;
  pricePerLitre: number;
}

interface OptimizeResult {
  routes: Record<string, DayRoute>;
  totalClients: number;
  totalDistanceKm: number;
  clientsWithoutAddress: number;
  fuel: FuelStats;
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

function firstAppointmentDate(startDate: string, day: string): Date {
  const d = new Date(startDate);
  d.setDate(d.getDate() + (DAY_OFFSET[day] ?? 0));
  return d;
}

function countPassages(startDate: string, day: string): number {
  const first = firstAppointmentDate(startDate, day);
  const end = new Date("2026-09-30");
  let count = 0;
  const cur = new Date(first);
  while (cur <= end) { count++; cur.setDate(cur.getDate() + 7); }
  return count;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
}

function loadConfirmedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem("confirmed_route_clients");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
}

function saveConfirmedIds(ids: Set<string>) {
  localStorage.setItem("confirmed_route_clients", JSON.stringify(Array.from(ids)));
}

export default function RoutesPage() {
  const [selectedDays, setSelectedDays] = useState(["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]);
  const [maxPerDay, setMaxPerDay] = useState(5);
  const [startTime, setStartTime] = useState("08:00");
  const [startDate, setStartDate] = useState("2026-04-20");
  const [fuelPer100, setFuelPer100] = useState(9);
  const [fuelPrice, setFuelPrice] = useState(1.65);
  const [routes, setRoutes] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Individual confirm state
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(loadConfirmedIds);
  const [previewKey, setPreviewKey] = useState<string | null>(null); // "{clientId}__{day}"
  const [clientConfirming, setClientConfirming] = useState(false);

  const markConfirmed = (clientId: string) => {
    const next = new Set(Array.from(confirmedIds).concat(clientId));
    setConfirmedIds(next);
    saveConfirmedIds(next);
  };

  const optimize = async () => {
    setLoading(true);
    setError("");
    setRoutes(null);
    setBulkConfirmed(false);
    setPreviewKey(null);
    try {
      const res = await fetch("/api/routes/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: selectedDays, maxPerDay, startTime, fuelPer100km: fuelPer100, fuelPricePerLitre: fuelPrice }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setRoutes(data);
      const firstDay = Object.keys(data.routes)[0];
      if (firstDay) setExpandedDay(firstDay);
    } catch {
      setError("Erreur lors de l'optimisation");
    } finally {
      setLoading(false);
    }
  };

  const confirmClient = async (client: RouteClient, day: string, sendSMS: boolean) => {
    setClientConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/routes/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routes: { [day]: { clients: [client] } },
          startDate,
          sendSMS,
        }),
      });
      const data = await res.json();
      if (data.success) {
        markConfirmed(client.id);
        setPreviewKey(null);
      } else {
        setError(data.error || "Erreur lors de la confirmation");
      }
    } catch {
      setError("Erreur lors de la confirmation");
    } finally {
      setClientConfirming(false);
    }
  };

  // For bulk confirm, only send non-confirmed clients
  const visibleRoutes = routes
    ? Object.fromEntries(
        Object.entries(routes.routes)
          .map(([day, data]) => [day, { ...data, clients: data.clients.filter(c => !confirmedIds.has(c.id)) }])
          .filter(([, data]) => (data as DayRoute).clients.length > 0)
      )
    : {};

  const bulkConfirm = async (sendSMS: boolean) => {
    if (!routes) return;
    setBulkConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/routes/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routes: visibleRoutes, startDate, sendSMS }),
      });
      const data = await res.json();
      if (data.success) {
        // Mark all visible clients as confirmed
        const allIds = Object.values(visibleRoutes).flatMap((d) => (d as DayRoute).clients.map(c => c.id));
        const next = new Set(Array.from(confirmedIds).concat(allIds));
        setConfirmedIds(next);
        saveConfirmedIds(next);
        setBulkConfirmed(true);
      } else {
        setError(data.error || "Erreur lors de la confirmation");
      }
    } catch {
      setError("Erreur lors de la confirmation");
    } finally {
      setBulkConfirming(false);
    }
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const pendingCount = routes
    ? Object.values(routes.routes).flatMap(d => d.clients).filter(c => !confirmedIds.has(c.id)).length
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Optimisation des routes</h1>
          <p className="text-sm text-gray-500 mt-1">Calcule les routes optimales avec les vrais temps de trajet Google Maps.</p>
        </div>
        {confirmedIds.size > 0 && (
          <button
            onClick={() => { setConfirmedIds(new Set()); saveConfirmedIds(new Set()); }}
            className="text-xs text-gray-400 hover:text-red-500 underline mt-1 flex-shrink-0"
          >
            Réinitialiser ({confirmedIds.size} confirmé{confirmedIds.size > 1 ? "s" : ""})
          </button>
        )}
      </div>

      {/* Config */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">Configuration</h2>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Jours disponibles</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  selectedDays.includes(day)
                    ? `${DAY_COLORS[day]} text-white shadow-sm`
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Max clients/jour</label>
            <input
              type="number"
              value={maxPerDay}
              min={1}
              max={20}
              onChange={e => setMaxPerDay(parseInt(e.target.value) || 5)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Heure de départ</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">L/100km</label>
            <input
              type="number"
              value={fuelPer100}
              min={1}
              max={30}
              step={0.5}
              onChange={e => setFuelPer100(parseFloat(e.target.value) || 9)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Prix/litre ($)</label>
            <input
              type="number"
              value={fuelPrice}
              min={0.5}
              max={5}
              step={0.01}
              onChange={e => setFuelPrice(parseFloat(e.target.value) || 1.65)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Premier jour de saison</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full sm:w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <button
          onClick={optimize}
          disabled={loading || selectedDays.length === 0}
          className="w-full bg-[#0a1f3f] text-white rounded-lg py-3 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#0f2855] disabled:opacity-50 transition"
        >
          {loading
            ? <><Loader2 size={18} className="animate-spin" /> Calcul en cours (Google Maps)...</>
            : <><MapPin size={18} /> Calculer les routes optimales</>
          }
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {routes && (() => {
        const totalWorkMin = Object.values(routes.routes).reduce((sum, d) => sum + d.totalDurationMin, 0);
        const workH = Math.floor(totalWorkMin / 60);
        const workM = totalWorkMin % 60;
        return (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{routes.totalClients}</p>
                <p className="text-xs text-gray-500 mt-0.5">Clients</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-indigo-600">{workH}h{String(workM).padStart(2, "0")}</p>
                <p className="text-xs text-gray-500 mt-0.5">Heures/sem.</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{routes.totalDistanceKm} km</p>
                <p className="text-xs text-gray-500 mt-0.5">Distance/sem.</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{routes.fuel.litresPerWeek} L</p>
                <p className="text-xs text-gray-500 mt-0.5">Essence/sem.</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{routes.fuel.costPerWeek.toFixed(2)} $</p>
                <p className="text-xs text-gray-500 mt-0.5">Coût/sem.</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{routes.fuel.costSeason.toFixed(0)} $</p>
                <p className="text-xs text-gray-500 mt-0.5">Coût/saison</p>
              </div>
            </div>

            {/* Info banners */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
              <Clock size={18} className="text-indigo-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-indigo-800">
                <span className="font-semibold">Temps de travail</span> — {routes.totalClients} clients × 45 min + trajets :{" "}
                <strong>{workH}h{String(workM).padStart(2, "0")} par semaine</strong>
                {" "}({Object.keys(routes.routes).length} journée{Object.keys(routes.routes).length > 1 ? "s" : ""}).
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <Fuel size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <span className="font-semibold">Estimation essence</span> — {routes.fuel.per100km} L/100km à {routes.fuel.pricePerLitre.toFixed(2)} $/L :{" "}
                <strong>{routes.fuel.litresPerWeek} L/semaine</strong> ({routes.fuel.costPerWeek.toFixed(2)} $),{" "}
                <strong>{routes.fuel.costSeason.toFixed(0)} $ sur 24 semaines</strong>.
              </div>
            </div>

            {routes.clientsWithoutAddress > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
                ⚠️ {routes.clientsWithoutAddress} client(s) sans adresse ne sont pas inclus dans les routes.
              </div>
            )}

            {/* Day routes */}
            {Object.entries(routes.routes).map(([day, data]) => {
              const visibleClients = data.clients.filter(c => !confirmedIds.has(c.id));
              const confirmedInDay = data.clients.length - visibleClients.length;
              return (
                <div key={day} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedDay(expandedDay === day ? null : day)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className={`w-3 h-3 rounded-full ${DAY_COLORS[day] ?? "bg-gray-400"}`} />
                      <span className="font-semibold text-gray-900">{day}</span>
                      <span className="text-sm text-gray-500">{visibleClients.length} client{visibleClients.length > 1 ? "s" : ""}</span>
                      {confirmedInDay > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                          {confirmedInDay} confirmé{confirmedInDay > 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-sm text-gray-400">• {data.totalDistanceKm} km</span>
                      <span className="text-sm text-gray-400">• ~{fmtDuration(data.totalDurationMin)}</span>
                      <span className="text-sm text-gray-400">• Fin: {data.estimatedEndTime}</span>
                    </div>
                    {expandedDay === day ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
                  </button>

                  {expandedDay === day && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      <div className="px-5 py-3 bg-green-50 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">🏠</div>
                        <div>
                          <p className="text-sm font-medium text-green-800">Départ — 86 rue de Windsor, Granby</p>
                          <p className="text-xs text-green-600">{startTime}</p>
                        </div>
                      </div>

                      {data.clients.map(client => {
                        const isConfirmed = confirmedIds.has(client.id);
                        const isPreviewOpen = previewKey === `${client.id}__${day}`;
                        const passages = countPassages(startDate, day);
                        const firstDate = firstAppointmentDate(startDate, day);

                        if (isConfirmed) {
                          return (
                            <div key={client.id} className="px-5 py-3 flex items-center gap-3 bg-green-50/50 opacity-60">
                              <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0">
                                <Check size={14} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-700 truncate">{client.name}</p>
                                <p className="text-xs text-green-600">RDV confirmé — chaque {day.toLowerCase()} à {client.estimatedArrival}</p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={client.id}>
                            <div className="px-5 py-3 flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-full ${DAY_COLORS[day] ?? "bg-gray-400"} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                                {client.order}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{client.name}</p>
                                <p className="text-xs text-gray-500 truncate">{client.address}</p>
                                <p className="text-xs text-gray-400">{client.distanceFromPrev} km • {client.drivingTimeFromPrev} min de trajet</p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-gray-900">↓ {client.estimatedArrival}</p>
                                  <p className="text-xs text-gray-400">↑ {client.estimatedDeparture}</p>
                                </div>
                                <button
                                  onClick={() => setPreviewKey(isPreviewOpen ? null : `${client.id}__${day}`)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                    isPreviewOpen
                                      ? "bg-gray-100 text-gray-600"
                                      : "bg-[#0a1f3f] text-white hover:bg-[#0f2855]"
                                  }`}
                                >
                                  {isPreviewOpen ? <X size={13} /> : <CalendarCheck size={13} />}
                                  {isPreviewOpen ? "Annuler" : "Confirmer"}
                                </button>
                              </div>
                            </div>

                            {/* Inline preview panel */}
                            {isPreviewOpen && (
                              <div className="mx-4 mb-3 bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                                <div>
                                  <p className="text-sm font-semibold text-blue-900">{client.name}</p>
                                  <p className="text-sm text-blue-800 mt-1">
                                    Entretien chaque <strong>{day.toLowerCase()}</strong> — arrivée <strong>{client.estimatedArrival}</strong>, départ <strong>{client.estimatedDeparture}</strong>
                                  </p>
                                  <p className="text-xs text-blue-600 mt-1">
                                    Premier RDV : {fmtDate(firstDate)} • {passages} passages jusqu&apos;au 30 sept. 2026
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => confirmClient(client, day, false)}
                                    disabled={clientConfirming}
                                    className="flex-1 bg-[#0a1f3f] text-white rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#0f2855] disabled:opacity-50 transition"
                                  >
                                    {clientConfirming ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    Confirmer sans SMS
                                  </button>
                                  <button
                                    onClick={() => confirmClient(client, day, true)}
                                    disabled={clientConfirming}
                                    className="flex-1 bg-green-600 text-white rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-green-700 disabled:opacity-50 transition"
                                  >
                                    {clientConfirming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                                    Confirmer + SMS
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="px-5 py-3 bg-green-50 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">🏠</div>
                        <div>
                          <p className="text-sm font-medium text-green-800">Retour à la maison</p>
                          <p className="text-xs text-green-600">{data.returnHomeKm} km • {data.returnHomeMin} min • Arrivée: {data.estimatedEndTime}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bulk confirm — only remaining non-confirmed */}
            {pendingCount > 0 && !bulkConfirmed && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Confirmer tous les RDV restants</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Crée les {pendingCount} RDV non confirmés du <strong>{startDate}</strong> jusqu&apos;au 30 septembre 2026.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => bulkConfirm(false)}
                    disabled={bulkConfirming}
                    className="flex-1 bg-[#0a1f3f] text-white rounded-lg py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0f2855] disabled:opacity-50 transition"
                  >
                    {bulkConfirming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Confirmer sans SMS
                  </button>
                  <button
                    onClick={() => bulkConfirm(true)}
                    disabled={bulkConfirming}
                    className="flex-1 bg-green-600 text-white rounded-lg py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {bulkConfirming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Confirmer + SMS clients
                  </button>
                </div>
              </div>
            )}

            {(bulkConfirmed || (pendingCount === 0 && routes.totalClients > 0)) && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <Check size={32} className="text-green-600 mx-auto mb-2" />
                <p className="font-semibold text-green-800 text-lg">Tous les RDV sont confirmés!</p>
                <p className="text-sm text-green-600 mt-1">Tous les rendez-vous ont été créés dans le calendrier.</p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
