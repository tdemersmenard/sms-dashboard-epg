"use client";

import { useState, useEffect } from "react";
import { MapPin, Loader2, AlertCircle, ChevronDown, ChevronUp, Check, Send, RefreshCw, Trash2, Calendar, X } from "lucide-react";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_COLORS: Record<string, string> = {
  Lundi: "bg-blue-500", Mardi: "bg-green-500", Mercredi: "bg-purple-500",
  Jeudi: "bg-orange-500", Vendredi: "bg-pink-500", Samedi: "bg-teal-500", Dimanche: "bg-red-500",
};

export default function RoutesPage() {
  // Config
  const [selectedDays, setSelectedDays] = useState(["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]);
  const [maxPerDay, setMaxPerDay] = useState(5);
  const [startTime, setStartTime] = useState("08:00");
  const [fuelPer100, setFuelPer100] = useState(9);
  const [fuelPrice, setFuelPrice] = useState(1.65);

  // State
  const [currentRoutes, setCurrentRoutes] = useState<any>(null);
  const [calculatedRoutes, setCalculatedRoutes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);

  // Fetch routes actuelles au mount
  useEffect(() => {
    fetchCurrentRoutes();
  }, []);

  const fetchCurrentRoutes = async () => {
    setLoadingCurrent(true);
    try {
      const res = await fetch("/api/routes/current", { cache: "no-store" });
      const data = await res.json();
      setCurrentRoutes(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCurrent(false);
    }
  };

  // Calculer les routes optimales
  const calculate = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setCalculatedRoutes(null);
    try {
      const res = await fetch("/api/routes/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: selectedDays, maxPerDay, startTime, fuelPer100km: fuelPer100, fuelPricePerLitre: fuelPrice }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setCalculatedRoutes(data);
    } catch { setError("Erreur lors du calcul"); }
    finally { setLoading(false); }
  };

  // Confirmer les routes
  const confirmRoutes = async (sendSMS: boolean) => {
    if (!calculatedRoutes) return;
    setConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/routes/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routes: calculatedRoutes.routes,
          startDate: new Date().toISOString().split("T")[0],
          sendSMS,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Routes confirmées! ${data.results.length} actions effectuées.${sendSMS ? " SMS envoyés aux clients." : ""}`);
        setCalculatedRoutes(null);
        fetchCurrentRoutes();
      } else {
        setError(data.error || "Erreur lors de la confirmation");
      }
    } catch { setError("Erreur lors de la confirmation"); }
    finally { setConfirming(false); }
  };

  // Supprimer tous les entretiens
  const deleteAllEntretiens = async () => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer TOUS les entretiens planifiés? Cette action est irréversible.")) return;
    try {
      const res = await fetch("/api/jobs/delete?bulk=true&type=entretien", { method: "DELETE" });
      if (res.ok) {
        setSuccess("Tous les entretiens ont été supprimés.");
        fetchCurrentRoutes();
      }
    } catch { setError("Erreur lors de la suppression"); }
  };

  const displayRoutes = calculatedRoutes || null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Routes d&apos;entretien</h1>
          <p className="text-sm text-gray-500 mt-1">Optimisation automatique des routes hebdomadaires</p>
        </div>
        <button onClick={fetchCurrentRoutes} className="text-gray-400 hover:text-gray-600 transition">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-400"><X size={16} /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Check size={18} className="text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700">{success}</p>
          <button onClick={() => setSuccess("")} className="ml-auto text-green-400"><X size={16} /></button>
        </div>
      )}

      {/* Routes actuelles */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            <h2 className="font-semibold text-gray-900">Routes actuelles</h2>
            {currentRoutes && <span className="text-sm text-gray-400">({currentRoutes.totalClients || 0} clients)</span>}
          </div>
          {currentRoutes && currentRoutes.totalClients > 0 && (
            <button onClick={deleteAllEntretiens} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
              <Trash2 size={14} /> Tout supprimer
            </button>
          )}
        </div>

        {loadingCurrent ? (
          <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
        ) : currentRoutes && currentRoutes.totalClients > 0 ? (
          <div className="divide-y divide-gray-50">
            {Object.entries(currentRoutes.routes || {}).map(([day, clients]: [string, any]) => (
              <div key={day} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${DAY_COLORS[day] || "bg-gray-400"}`} />
                  <span className="font-medium text-sm text-gray-900">{day}</span>
                  <span className="text-xs text-gray-400">{clients.length} clients</span>
                </div>
                <div className="ml-5 space-y-1">
                  {clients.map((client: any, idx: number) => (
                    <div key={client.id} className="flex items-center gap-3 text-sm py-1">
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-medium">{idx + 1}</span>
                      <span className="font-medium text-gray-800 flex-1">{client.name}</span>
                      <span className="text-gray-400 text-xs hidden md:block">{client.address}</span>
                      <span className="text-gray-500 text-xs">{client.time}</span>
                      <span className="text-gray-300 text-xs">{client.remainingJobs}x</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <MapPin size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucune route planifiée</p>
            <p className="text-xs text-gray-300 mt-1">Calculez les routes optimales ci-dessous</p>
          </div>
        )}
      </div>

      {/* Calculer de nouvelles routes */}
      <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Calculer les routes optimales</h2>

        {/* Jours */}
        <div>
          <label className="block text-sm text-gray-600 mb-2">Jours disponibles</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  selectedDays.includes(day) ? `${DAY_COLORS[day]} text-white` : "bg-gray-100 text-gray-500"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max clients/jour</label>
            <input type="number" value={maxPerDay} onChange={e => setMaxPerDay(parseInt(e.target.value) || 5)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Heure de départ</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Consommation (L/100km)</label>
            <input type="number" value={fuelPer100} onChange={e => setFuelPer100(parseFloat(e.target.value) || 9)} step="0.5" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Prix essence ($/L)</label>
            <input type="number" value={fuelPrice} onChange={e => setFuelPrice(parseFloat(e.target.value) || 1.65)} step="0.05" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <button
          onClick={calculate}
          disabled={loading || selectedDays.length === 0}
          className="w-full bg-[#0a1f3f] text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#0d2a52] transition"
        >
          {loading ? <><Loader2 size={18} className="animate-spin" /> Calcul en cours...</> : <><MapPin size={18} /> Calculer les routes optimales</>}
        </button>
      </div>

      {/* Résultats du calcul */}
      {displayRoutes && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{displayRoutes.totalClients}</p>
              <p className="text-xs text-gray-500">Clients</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{displayRoutes.totalDistanceKm} km</p>
              <p className="text-xs text-gray-500">Dist./semaine</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-orange-500">{displayRoutes.fuel?.weeklyFuelLitres ?? "?"} L</p>
              <p className="text-xs text-gray-500">Essence/sem.</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{displayRoutes.fuel?.weeklyFuelCost?.toFixed(2) ?? "?"} $</p>
              <p className="text-xs text-gray-500">Coût/sem.</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{displayRoutes.fuel?.seasonFuelCost?.toFixed(0) ?? "?"} $</p>
              <p className="text-xs text-gray-500">Coût/saison</p>
            </div>
          </div>

          {displayRoutes?.clientsWithoutAddress?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="font-semibold text-red-800 text-sm">⚠ Clients sans adresse (non inclus):</p>
              <ul className="mt-1">{displayRoutes.clientsWithoutAddress.map((n: string, i: number) => (
                <li key={i} className="text-sm text-red-700">• {n}</li>
              ))}</ul>
            </div>
          )}

          {displayRoutes?.clientsWithoutOuverture?.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="font-semibold text-orange-800 text-sm">⚠ Clients sans date d&apos;ouverture:</p>
              <ul className="mt-1">{displayRoutes.clientsWithoutOuverture.map((n: string, i: number) => (
                <li key={i} className="text-sm text-orange-700">• {n}</li>
              ))}</ul>
            </div>
          )}

          {displayRoutes?.failedGeocode?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="font-semibold text-yellow-800 text-sm">⚠ Adresses non reconnues par Google:</p>
              <ul className="mt-1">{displayRoutes.failedGeocode.map((n: string, i: number) => (
                <li key={i} className="text-sm text-yellow-700">• {n}</li>
              ))}</ul>
            </div>
          )}

          {/* Routes par jour */}
          {Object.entries(displayRoutes.routes || {}).map(([day, data]: [string, any]) => (
            <div key={day} className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <button
                onClick={() => setExpandedDay(expandedDay === day ? null : day)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${DAY_COLORS[day] || "bg-gray-400"}`} />
                  <span className="font-semibold text-gray-900">{day}</span>
                  <span className="text-sm text-gray-500">{data.clients?.length || 0} clients</span>
                  <span className="text-sm text-gray-400 hidden md:inline">• {data.totalDistanceKm} km • ~{Math.floor((data.totalDurationMin || 0) / 60)}h{String((data.totalDurationMin || 0) % 60).padStart(2, "0")}</span>
                </div>
                {expandedDay === day ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              </button>

              {expandedDay === day && (
                <div className="border-t divide-y divide-gray-50">
                  <div className="px-4 py-2 bg-green-50 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">🏠</div>
                    <div>
                      <p className="text-sm font-medium text-green-800">Départ — 86 rue de Windsor, Granby</p>
                      <p className="text-xs text-green-600">{startTime}</p>
                    </div>
                  </div>

                  {(data.clients || []).map((client: any) => (
                    <div key={client.id} className="px-4 py-3 flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full ${DAY_COLORS[day] || "bg-gray-400"} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                        {client.order}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{client.name}</p>
                          <select
                            className="text-xs border rounded px-1 py-0.5 text-gray-500 bg-white"
                            defaultValue=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const newDay = e.target.value;
                              setCalculatedRoutes((prev: any) => {
                                if (!prev) return prev;
                                const updated = { ...prev, routes: { ...prev.routes } };
                                updated.routes[day] = {
                                  ...updated.routes[day],
                                  clients: updated.routes[day].clients.filter((c: any) => c.id !== client.id),
                                };
                                if (!updated.routes[newDay]) {
                                  updated.routes[newDay] = { clients: [], totalDistanceKm: 0, totalDurationMin: 0, estimatedEndTime: "", returnHomeKm: 0, returnHomeMin: 0 };
                                }
                                updated.routes[newDay] = {
                                  ...updated.routes[newDay],
                                  clients: [...updated.routes[newDay].clients, { ...client, order: updated.routes[newDay].clients.length + 1 }],
                                };
                                return updated;
                              });
                              e.target.value = "";
                            }}
                          >
                            <option value="">Déplacer...</option>
                            {Object.keys(displayRoutes.routes).filter((d: string) => d !== day).map((d: string) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{client.address}</p>
                        {client.ouvertureDate && (
                          <p className="text-xs text-blue-500">Ouverture: {client.ouvertureDate} → 1er entretien: {client.firstEntretien || "—"}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium text-gray-900">{client.estimatedArrival} → {client.estimatedDeparture}</p>
                        <p className="text-xs text-gray-400">{client.distanceFromPrev} km • {client.drivingTimeFromPrev} min</p>
                      </div>
                    </div>
                  ))}

                  <div className="px-4 py-2 bg-green-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">🏠</div>
                      <p className="text-sm font-medium text-green-800">Retour à la maison</p>
                    </div>
                    <p className="text-xs text-green-600">{data.returnHomeKm} km • {data.returnHomeMin} min</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Boutons confirmer */}
          <div className="bg-white rounded-xl shadow-sm border p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Confirmer les routes</h3>
            <p className="text-sm text-gray-500">Les entretiens seront planifiés 7 jours après l&apos;ouverture de chaque client, jusqu&apos;à fin septembre 2026.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => confirmRoutes(false)}
                disabled={confirming}
                className="flex-1 bg-[#0a1f3f] text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#0d2a52] transition"
              >
                {confirming ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                Confirmer sans SMS
              </button>
              <button
                onClick={() => confirmRoutes(true)}
                disabled={confirming}
                className="flex-1 bg-green-600 text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-green-700 transition"
              >
                {confirming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Confirmer + SMS aux clients
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
