"use client";

import { useState, useEffect } from "react";
import { Loader2, MapPin, Send, Check, AlertCircle, X, Play, Users } from "lucide-react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

const DAY_COLORS: Record<string, string> = { Lundi: "#3b82f6", Mardi: "#10b981", Mercredi: "#a855f7", Jeudi: "#f97316", Vendredi: "#ec4899" };

const EMP_COLORS = ["#3b82f6", "#10b981", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#ef4444", "#f59e0b"];

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

  // Employee assignment
  const [employees, setEmployees] = useState<{ id: string; name: string; zone?: string }[]>([]);
  const [assignedMap, setAssignedMap] = useState<Record<string, string | null>>({});
  const [empFilter, setEmpFilter] = useState("all");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignToast, setAssignToast] = useState<string | null>(null);

  // Zone bulk assign
  const [bulkZone, setBulkZone] = useState("");
  const [bulkEmpId, setBulkEmpId] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const empColor = (empId: string | null) => {
    if (!empId) return "#9ca3af";
    const idx = employees.findIndex(e => e.id === empId);
    return idx >= 0 ? EMP_COLORS[idx % EMP_COLORS.length] : "#6b7280";
  };
  const empName = (empId: string | null) => {
    if (!empId) return "Thomas";
    return employees.find(e => e.id === empId)?.name ?? "—";
  };

  // Charger l'état sauvegardé + employés au mount
  useEffect(() => {
    fetch("/api/routes/state", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.exists) {
          setData(d);
          if (d.confirmedIds) setConfirmedIds(d.confirmedIds);
        }
      });
    fetch("/api/employes/list")
      .then(r => r.json())
      .then(d => {
        const emps = d.employees || [];
        setEmployees(emps);
        if (emps.length > 0) setBulkEmpId(emps[0].id);
        // Collect unique zones from employees
        const zones = Array.from(new Set(emps.map((e: any) => e.zone).filter(Boolean))) as string[];
        if (zones.length > 0) setBulkZone(zones[0]);
      });
  }, []);

  // Fetch contact assignments whenever route data changes
  useEffect(() => {
    if (!data?.routes) return;
    const ids = Array.from(new Set<string>(data.routes.flatMap((r: any) => r.stops.map((s: any) => s.id))));
    if (!ids.length) return;
    supabaseBrowser
      .from("contacts")
      .select("id, assigned_employee_id")
      .in("id", ids)
      .then(({ data: cs }) => {
        const map: Record<string, string | null> = {};
        (cs || []).forEach((c: any) => { map[c.id] = c.assigned_employee_id ?? null; });
        setAssignedMap(map);
      });
  }, [data]);

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
          icon: stop.isBiweekly
            ? { path: "M -10,-10 L 10,-10 L 10,10 L -10,10 Z", scale: 1, fillColor: color, fillOpacity: 1, strokeColor: "white", strokeWeight: 2 }
            : { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: color, fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
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

  const assignClient = async (contactId: string, employeeId: string | null) => {
    setAssigning(contactId);
    try {
      const res = await fetch("/api/contacts/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, employeeId: employeeId || null }),
      });
      const result = await res.json();
      setAssignedMap(prev => ({ ...prev, [contactId]: employeeId || null }));
      const name = result.employeeName ?? empName(employeeId);
      const n = result.jobsUpdated ?? 0;
      setAssignToast(`${n} job${n !== 1 ? "s" : ""} de ${data?.routes?.flatMap((r: any) => r.stops).find((s: any) => s.id === contactId)?.name ?? "ce client"} → ${name}`);
      setTimeout(() => setAssignToast(null), 3000);
    } finally {
      setAssigning(null);
    }
  };

  const assignByZone = async () => {
    if (!bulkZone) return;
    setBulkAssigning(true);
    try {
      const res = await fetch("/api/contacts/assign-zone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: bulkZone, employeeId: bulkEmpId || null }),
      });
      const result = await res.json();
      // Refresh assignedMap
      if (data?.routes) {
        const ids = Array.from(new Set<string>(data.routes.flatMap((r: any) => r.stops.map((s: any) => s.id))));
        const { data: cs } = await supabaseBrowser.from("contacts").select("id, assigned_employee_id").in("id", ids);
        const map: Record<string, string | null> = { ...assignedMap };
        (cs || []).forEach((c: any) => { map[c.id] = c.assigned_employee_id ?? null; });
        setAssignedMap(map);
      }
      setAssignToast(result.message ?? "Attribution par zone terminée");
      setTimeout(() => setAssignToast(null), 4000);
    } finally {
      setBulkAssigning(false);
    }
  };

  // Filter stops by selected employee
  const filterStops = (stops: any[]) => {
    if (empFilter === "all") return stops;
    if (empFilter === "thomas") return stops.filter(s => !assignedMap[s.id]);
    return stops.filter(s => assignedMap[s.id] === empFilter);
  };

  const uniqueZones = Array.from(new Set(employees.map(e => e.zone).filter(Boolean))) as string[];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Toast */}
      {assignToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0a1f3f] text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          ✓ {assignToast}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Routes d&apos;entretien</h1>
          <p className="text-sm text-gray-500 mt-1">Calcul automatique optimisé pour minimiser les déplacements</p>
        </div>
        <Link
          href="/routes/today"
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg"
        >
          <Play size={18} /> Démarrer l&apos;itinéraire d&apos;aujourd&apos;hui
        </Link>
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
              <p className="text-2xl font-bold text-gray-900">{data.routes.reduce((sum: number, r: any) => sum + r.stops.length, 0)}</p>
              <p className="text-xs text-gray-500">Clients</p>
            </div>
            <div className="bg-white rounded-xl border p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{Math.round(data.routes.reduce((sum: number, r: any) => sum + (r.totalKm || 0), 0) * 10) / 10} km</p>
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

          {/* Employee filter bar */}
          {employees.length > 0 && (
            <div className="bg-white rounded-xl border p-4 flex items-center gap-2 flex-wrap">
              <Users size={15} className="text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 font-medium mr-1">Voir:</span>
              <button
                onClick={() => setEmpFilter("all")}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${empFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                Tous
              </button>
              <button
                onClick={() => setEmpFilter("thomas")}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${empFilter === "thomas" ? "bg-gray-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                Thomas
              </button>
              {employees.map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => setEmpFilter(e.id)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium transition text-white"
                  style={{ backgroundColor: empFilter === e.id ? EMP_COLORS[i % EMP_COLORS.length] : `${EMP_COLORS[i % EMP_COLORS.length]}88` }}
                >
                  {e.name}
                </button>
              ))}
            </div>
          )}

          {/* Map */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div id="routes-map" style={{ width: "100%", height: 400 }}></div>
          </div>

          {/* Routes list */}
          <div className="space-y-3">
            {data.routes.map((route: any) => {
              const filteredStops = filterStops(route.stops);
              if (filteredStops.length === 0 && empFilter !== "all") return null;
              return (
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
                      <span className="text-sm text-gray-500">
                        {empFilter === "all" ? route.stops.length : filteredStops.length} clients
                        {empFilter !== "all" && ` / ${route.stops.length} total`}
                      </span>
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
                    {(empFilter === "all" ? route.stops : filteredStops).map((stop: any, idx: number) => (
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900">{stop.name}</p>
                            {stop.isBiweekly && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase">
                                2 sem
                              </span>
                            )}
                            {/* Employee badge */}
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: empColor(assignedMap[stop.id] ?? null) }}
                            >
                              {empName(assignedMap[stop.id] ?? null)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{stop.address}</p>
                          {/* Assignment dropdown */}
                          {employees.length > 0 && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <select
                                value={assignedMap[stop.id] ?? ""}
                                onChange={e => assignClient(stop.id, e.target.value || null)}
                                disabled={assigning === stop.id}
                                className="text-[10px] border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-gray-50 focus:outline-none focus:border-blue-300 disabled:opacity-50"
                              >
                                <option value="">— Thomas</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                              </select>
                              {assigning === stop.id && <Loader2 size={11} className="animate-spin text-gray-400" />}
                            </div>
                          )}
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
              );
            })}
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
            </div>
          </div>

          {/* Zone bulk assignment */}
          {employees.length > 0 && (
            <div className="bg-white rounded-xl border p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-800">Attribution par zone</h3>
              </div>
              <p className="text-xs text-gray-500">Assigner tous les clients d&apos;une zone à un employé d&apos;un seul coup (basé sur la ville du contact).</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Zone (ville)</label>
                  {uniqueZones.length > 0 ? (
                    <select
                      value={bulkZone}
                      onChange={e => setBulkZone(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={bulkZone}
                      onChange={e => setBulkZone(e.target.value)}
                      placeholder="ex: Granby, Waterloo..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Assigné à</label>
                  <select
                    value={bulkEmpId}
                    onChange={e => setBulkEmpId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">— Thomas (défaut)</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="flex-shrink-0 self-end">
                  <button
                    onClick={assignByZone}
                    disabled={bulkAssigning || !bulkZone}
                    className="px-4 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0d2a52] disabled:opacity-50 flex items-center gap-2 transition"
                  >
                    {bulkAssigning ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                    Assigner
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
