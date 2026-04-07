"use client";

import { useState, useEffect } from "react";
import { Loader2, MapPin, Send, Check, AlertCircle, X } from "lucide-react";

const DAY_COLORS: Record<string, string> = { Lundi: "#3b82f6", Mardi: "#10b981", Mercredi: "#a855f7", Jeudi: "#f97316", Vendredi: "#ec4899" };

export default function RoutesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draggedStop, setDraggedStop] = useState<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [confirmingIds, setConfirmingIds] = useState<string[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);

  // Charger l'état sauvegardé au mount
  useEffect(() => {
    fetch("/api/routes/state", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.exists) {
          setData(d);
          if (d.confirmedIds) setConfirmedIds(d.confirmedIds);
        }
      });
  }, []);

  // Load Google Maps
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).google?.maps) { setMapLoaded(true); return; }
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Render map when data is loaded
  useEffect(() => {
    if (!mapLoaded || !data?.routes) return;
    const mapEl = document.getElementById("routes-map");
    if (!mapEl) return;

    const google = (window as any).google;
    const map = new google.maps.Map(mapEl, {
      center: { lat: data.home.lat, lng: data.home.lng },
      zoom: 11,
    });

    new google.maps.Marker({
      position: { lat: data.home.lat, lng: data.home.lng },
      map, title: "Maison",
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#0a1f3f", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
    });

    for (const route of data.routes) {
      const color = DAY_COLORS[route.day] || "#666";
      route.stops.forEach((stop: any, idx: number) => {
        const marker = new google.maps.Marker({
          position: { lat: stop.lat, lng: stop.lng },
          map, title: stop.name,
          label: { text: String(idx + 1), color: "white", fontSize: "12px", fontWeight: "bold" },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: color, fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
        });
        const info = new google.maps.InfoWindow({
          content: `<div style="padding:4px"><strong>${stop.name}</strong><br>${stop.address}<br><small>${route.day} ${stop.arrivalTime}</small></div>`,
        });
        marker.addListener("click", () => info.open(map, marker));
      });
    }
  }, [data, mapLoaded]);

  const calculate = async () => {
    setLoading(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/routes/calculate", { method: "POST" });
      const result = await res.json();
      if (result.error) { setError(result.error); return; }
      setData(result);
    } catch { setError("Erreur lors du calcul"); }
    finally { setLoading(false); }
  };

  const confirm = async (sendSMS: boolean) => {
    if (!data?.routes) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/routes/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routes: data.routes, sendSMS }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess(`${result.results.length} actions effectuées${sendSMS ? " + SMS envoyés" : ""}`);
      } else setError(result.error);
    } catch { setError("Erreur lors de la confirmation"); }
    finally { setConfirming(false); }
  };

  const moveStop = async (stop: any, fromDay: string, toDay: string, toIndex?: number) => {
    setData((prev: any) => {
      if (!prev) return prev;
      const newRoutes = prev.routes.map((r: any) => {
        if (r.day === fromDay && fromDay === toDay) {
          const stops = r.stops.filter((s: any) => s.id !== stop.id);
          const insertAt = toIndex !== undefined ? toIndex : stops.length;
          stops.splice(insertAt, 0, stop);
          return { ...r, stops: stops.map((s: any, i: number) => ({ ...s, order: i + 1 })) };
        }
        if (r.day === fromDay) {
          return { ...r, stops: r.stops.filter((s: any) => s.id !== stop.id).map((s: any, i: number) => ({ ...s, order: i + 1 })) };
        }
        if (r.day === toDay) {
          const stops = [...r.stops];
          const insertAt = toIndex !== undefined ? toIndex : stops.length;
          stops.splice(insertAt, 0, stop);
          return { ...r, stops: stops.map((s: any, i: number) => ({ ...s, order: i + 1 })) };
        }
        return r;
      });
      return { ...prev, routes: newRoutes };
    });

    // Recalculer les temps puis sauvegarder
    setTimeout(async () => {
      const currentData = await new Promise<any>(resolve => setData((prev: any) => { resolve(prev); return prev; }));
      try {
        const res = await fetch("/api/routes/recalculate-times", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routes: currentData.routes }),
        });
        const result = await res.json();
        if (result.routes) {
          setData((prev: any) => {
            const updated = { ...prev, routes: result.routes, totalKm: result.totalKm };
            // Sauvegarder après recalcul
            fetch("/api/routes/save-state", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updated),
            });
            return updated;
          });
        }
      } catch {} // eslint-disable-line no-empty
    }, 100);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Routes d&apos;entretien</h1>
        <p className="text-sm text-gray-500 mt-1">Calcul automatique optimisé pour minimiser les déplacements</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-500" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError("")}><X size={16} /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Check size={18} className="text-green-500" />
          <p className="text-sm text-green-700 flex-1">{success}</p>
          <button onClick={() => setSuccess("")}><X size={16} /></button>
        </div>
      )}

      {!data && (
        <button
          onClick={calculate}
          disabled={loading}
          className="w-full bg-[#0a1f3f] text-white rounded-xl py-4 font-semibold flex items-center justify-center gap-2 hover:bg-[#0d2a52] transition disabled:opacity-50"
        >
          {loading
            ? <><Loader2 size={20} className="animate-spin" /> Calcul en cours (peut prendre 30-60s)...</>
            : <><MapPin size={20} /> Calculer les routes optimales</>}
        </button>
      )}

      {data && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{data.totalClients}</p>
              <p className="text-xs text-gray-500">Clients</p>
            </div>
            <div className="bg-white rounded-xl border p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{data.totalKm} km</p>
              <p className="text-xs text-gray-500">Distance/semaine</p>
            </div>
            <div className="bg-white rounded-xl border p-4 text-center">
              <p className="text-2xl font-bold text-orange-500">{data.routes.length}</p>
              <p className="text-xs text-gray-500">Jours utilisés</p>
            </div>
          </div>

          {/* Problems */}
          {(data.problems?.noAddress?.length > 0 || data.problems?.noOuverture?.length > 0 || data.problems?.failedGeocode?.length > 0) && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
              {data.problems.noAddress?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-orange-800">⚠ Sans adresse:</p>
                  <p className="text-xs text-orange-700">{data.problems.noAddress.join(", ")}</p>
                </div>
              )}
              {data.problems.noOuverture?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-orange-800">⚠ Sans date d&apos;ouverture:</p>
                  <p className="text-xs text-orange-700">{data.problems.noOuverture.join(", ")}</p>
                </div>
              )}
              {data.problems.failedGeocode?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-orange-800">⚠ Adresses non reconnues:</p>
                  <p className="text-xs text-orange-700">{data.problems.failedGeocode.join(", ")}</p>
                </div>
              )}
            </div>
          )}

          {/* Map */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div id="routes-map" style={{ width: "100%", height: 400 }}></div>
          </div>

          {/* Routes list */}
          <div className="space-y-3">
            {data.routes.map((route: any) => (
              <div
                key={route.day}
                className="bg-white rounded-xl border overflow-hidden"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedStop) {
                    moveStop(draggedStop.stop, draggedStop.fromDay, route.day);
                    setDraggedStop(null);
                  }
                }}
              >
                {/* Day header */}
                <div className="px-4 py-3 border-b" style={{ borderLeftWidth: 4, borderLeftColor: DAY_COLORS[route.day] }}>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-gray-900">{route.day}</span>
                    <span className="text-sm text-gray-500">{route.stops.length} clients</span>
                  </div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-3">
                    <span>🏠 Départ 08:00</span>
                    <span>📍 {route.totalKm} km</span>
                    <span>⏱ ~{Math.floor(route.totalMin / 60)}h{String(route.totalMin % 60).padStart(2, "0")}</span>
                    <span>🏠 Retour {route.endTime}</span>
                  </div>
                </div>

                {/* Stops */}
                <div className="divide-y divide-gray-50">
                  {route.stops.map((stop: any, idx: number) => (
                    <div
                      key={stop.id}
                      draggable={!confirmedIds.includes(stop.id)}
                      onDragStart={() => !confirmedIds.includes(stop.id) && setDraggedStop({ stop, fromDay: route.day })}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirmedIds.includes(stop.id)) return;
                        if (draggedStop && draggedStop.stop.id !== stop.id) {
                          moveStop(draggedStop.stop, draggedStop.fromDay, route.day, idx);
                          setDraggedStop(null);
                        }
                      }}
                      className={`px-4 py-3 flex items-center gap-3 border-l-2 border-transparent ${
                        confirmedIds.includes(stop.id)
                          ? "bg-green-50/30 cursor-default"
                          : "hover:bg-gray-50 cursor-move hover:border-blue-300"
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: DAY_COLORS[route.day] }}
                      >
                        {stop.order}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{stop.name}</p>
                        <p className="text-xs text-gray-500 truncate">{stop.address}</p>
                      </div>

                      {/* Confirm button / confirmed state */}
                      {confirmedIds.includes(stop.id) ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">✓ Confirmé</span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!window.confirm("Annuler la confirmation? Le client ne sera pas notifié à nouveau.")) return;
                              await fetch("/api/routes/unconfirm", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ contactId: stop.id }),
                              });
                              setConfirmedIds(prev => prev.filter(id => id !== stop.id));
                            }}
                            className="text-red-400 hover:text-red-600 text-xs"
                            title="Annuler la confirmation"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirmingIds.includes(stop.id)) return;
                            setConfirmingIds(prev => [...prev, stop.id]);
                            try {
                              const res = await fetch("/api/routes/confirm-single", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ stop, day: route.day }),
                              });
                              const result = await res.json();
                              if (result.success) {
                                setConfirmedIds(prev => [...prev, stop.id]);
                                setSuccess(`${stop.name} confirmé et SMS envoyé!`);
                                setTimeout(() => setSuccess(""), 3000);
                              } else {
                                setError(result.error || "Erreur");
                              }
                            } finally {
                              setConfirmingIds(prev => prev.filter(id => id !== stop.id));
                            }
                          }}
                          disabled={confirmingIds.includes(stop.id)}
                          className="text-xs px-2 py-1 rounded flex-shrink-0 bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                        >
                          {confirmingIds.includes(stop.id) ? "..." : "Confirmer"}
                        </button>
                      )}

                      <div className="text-right text-xs text-gray-500 flex-shrink-0 space-y-0.5">
                        <p className="text-sm font-semibold text-gray-900">{stop.arrivalTime} → {stop.departureTime}</p>
                        <p>{stop.distFromPrev} km • {stop.driveMinFromPrev} min route</p>
                        <p className="text-blue-500">1er: {stop.firstEntretienDate}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Confirm all */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <p className="text-sm text-gray-500">Confirmer va créer tous les rendez-vous d&apos;entretien jusqu&apos;au 30 septembre 2026.</p>
            <div className="flex flex-col md:flex-row gap-3">
              <button
                onClick={() => confirm(false)}
                disabled={confirming}
                className="flex-1 bg-[#0a1f3f] text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#0d2a52] transition"
              >
                {confirming ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                Confirmer tout sans SMS
              </button>
              <button
                onClick={() => confirm(true)}
                disabled={confirming}
                className="flex-1 bg-green-600 text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-green-700 transition"
              >
                {confirming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Confirmer tout + SMS
              </button>
              <button
                onClick={calculate}
                disabled={loading}
                className="bg-gray-100 text-gray-700 rounded-lg py-3 px-4 font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin inline" /> : "Recalculer"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
