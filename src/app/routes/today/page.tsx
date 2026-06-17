"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Navigation, Check, Phone, MapPin, Clock, ArrowLeft, Loader2, Camera, RefreshCw } from "lucide-react";
import Link from "next/link";
import PostVisitChecklist from "@/components/PostVisitChecklist";

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const HOME_ADDR = "86 rue de Windsor, Granby, QC";

const JOB_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  entretien: { label: "Entretien",  color: "#3b82f6", bg: "#eff6ff" },
  ouverture: { label: "Ouverture",  color: "#10b981", bg: "#f0fdf4" },
  fermeture: { label: "Fermeture",  color: "#f97316", bg: "#fff7ed" },
  visite:    { label: "Visite",     color: "#a855f7", bg: "#faf5ff" },
  autre:     { label: "Autre",      color: "#6b7280", bg: "#f9fafb" },
};

interface Stop {
  key: string;
  jobId?: string;
  contactId: string;
  contactName: string;
  phone: string;
  address: string;
  jobType: string;
  startTime?: string;
  endTime?: string;
  fromRouteState?: boolean;
  assignedEmployeeId?: string | null;
}

export default function TodayRoutePage() {
  const [loading, setLoading] = useState(true);
  const [todayName, setTodayName] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [checklistStop, setChecklistStop] = useState<{ name: string; id: string; jobType: string } | null>(null);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadToday();
    fetch("/api/employes/list").then(r => r.json()).then(d => setEmployees(d.employees || []));
  }, []);

  const loadToday = async () => {
    setLoading(true);
    const today = new Date();
    const dayName = DAYS_FR[today.getDay()];
    setTodayName(dayName);
    const todayStr = today.toISOString().split("T")[0];

    // 1. Load all today's jobs
    const { data: jobs } = await supabaseBrowser
      .from("jobs")
      .select("id, contact_id, job_type, scheduled_time_start, scheduled_time_end, status, assigned_employee_id")
      .eq("scheduled_date", todayStr)
      .in("status", ["planifié", "confirmé", "en_cours"])
      .order("scheduled_time_start", { ascending: true, nullsFirst: false });

    // 2. Fetch contacts for those jobs
    const jobContactIds = (jobs || []).map(j => j.contact_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactMap = new Map<string, any>();
    if (jobContactIds.length > 0) {
      const { data: contacts } = await supabaseBrowser
        .from("contacts")
        .select("id, first_name, last_name, phone, address")
        .in("id", jobContactIds);
      (contacts || []).forEach(c => contactMap.set(c.id, c));
    }

    // 3. Build stops from jobs
    const jobStops: Stop[] = (jobs || []).map(j => {
      const c = contactMap.get(j.contact_id);
      return {
        key: j.id,
        jobId: j.id,
        contactId: j.contact_id,
        contactName: c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Inconnu" : "Inconnu",
        phone: c?.phone || "",
        address: c?.address || "",
        jobType: j.job_type || "entretien",
        startTime: j.scheduled_time_start?.slice(0, 5),
        endTime: j.scheduled_time_end?.slice(0, 5),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assignedEmployeeId: (j as any).assigned_employee_id ?? null,
      };
    });

    // 4. Load route_state for recurring entretiens not yet confirmed (no job entry today)
    const { data: routeState } = await supabaseBrowser
      .from("route_state").select("data").eq("id", 1).single();

    const jobContactSet = new Set(jobContactIds);
    const rsStops: Stop[] = [];

    if (routeState?.data?.routes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dayRoute = routeState.data.routes.find((r: any) => r.day === dayName);
      if (dayRoute?.stops) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extraIds = dayRoute.stops.filter((s: any) => !jobContactSet.has(s.id)).map((s: any) => s.id);
        if (extraIds.length > 0) {
          const { data: extraContacts } = await supabaseBrowser
            .from("contacts").select("id, first_name, last_name, phone, address").in("id", extraIds);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const extraMap = new Map((extraContacts || []).map((c: any) => [c.id, c]));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dayRoute.stops.filter((s: any) => !jobContactSet.has(s.id)).forEach((s: any) => {
            const c = extraMap.get(s.id);
            rsStops.push({
              key: `rs-${s.id}`,
              contactId: s.id,
              contactName: c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Inconnu" : s.name || "Inconnu",
              phone: c?.phone || s.phone || "",
              address: c?.address || s.address || "",
              jobType: "entretien",
              startTime: s.startTime,
              fromRouteState: true,
            });
          });
        }
      }
    }

    // 5. Merge and sort by startTime (nulls last)
    const allStops = [...jobStops, ...rsStops].sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });
    setStops(allStops);

    // 6. Mark already-completed
    const { data: completedJobs } = await supabaseBrowser
      .from("jobs").select("id, contact_id").eq("scheduled_date", todayStr).eq("status", "complété");
    if (completedJobs) {
      const keys = new Set<string>();
      completedJobs.forEach(j => { keys.add(j.id); keys.add(`rs-${j.contact_id}`); keys.add(j.contact_id); });
      setDoneKeys(keys);
    }

    setLoading(false);
  };

  const isDone = (stop: Stop) =>
    doneKeys.has(stop.key) || (stop.jobId ? doneKeys.has(stop.jobId) : false) || doneKeys.has(stop.contactId);

  const markAsDone = async (stop: Stop) => {
    const todayStr = new Date().toISOString().split("T")[0];
    if (stop.jobId) {
      await supabaseBrowser.from("jobs").update({ status: "complété" }).eq("id", stop.jobId);
    } else {
      const { data: existing } = await supabaseBrowser.from("jobs").select("id")
        .eq("contact_id", stop.contactId).eq("scheduled_date", todayStr).eq("job_type", "entretien").limit(1);
      if (existing && existing.length > 0) {
        await supabaseBrowser.from("jobs").update({ status: "complété" }).eq("id", existing[0].id);
      }
    }
    setDoneKeys(prev => new Set(Array.from(prev).concat([stop.key, stop.contactId])));
  };

  const assignJob = async (jobId: string, employeeId: string | null) => {
    await fetch("/api/jobs/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, employeeId: employeeId || null }),
    });
    setStops(prev => prev.map(s => s.jobId === jobId ? { ...s, assignedEmployeeId: employeeId } : s));
  };

  const handlePhotoCapture = async (contactId: string, file: File) => {
    setPhotoUploading(contactId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contactId", contactId);
      formData.append("type", "photo_thomas");
      await fetch("/api/photos/upload", { method: "POST", body: formData });
    } catch (e) {
      console.error("Erreur upload photo:", e);
      alert("Erreur lors de l'upload");
    } finally {
      setPhotoUploading(null);
    }
  };

  const navigateToStop = (stop: Stop) => {
    const dest = encodeURIComponent(stop.address || stop.contactName);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, "_blank");
  };

  const navigateAll = () => {
    const remaining = stops.filter(s => !isDone(s));
    if (remaining.length === 0) return;
    const points = [...remaining.map(s => s.address || s.contactName), HOME_ADDR];
    const dest = encodeURIComponent(points[points.length - 1]);
    const waypoints = points.slice(0, -1).map(p => encodeURIComponent(p)).join("|");
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(HOME_ADDR)}&destination=${dest}&waypoints=${waypoints}&travelmode=driving`,
      "_blank"
    );
  };

  const remaining = stops.filter(s => !isDone(s));
  const allDone = stops.length > 0 && remaining.length === 0;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/routes" className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Itinéraire {todayName}</h1>
          <p className="text-xs text-gray-500">{stops.length - remaining.length} / {stops.length} complétés</p>
        </div>
        <button onClick={loadToday} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200" title="Rafraîchir">
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      ) : stops.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <p className="text-gray-500">Aucun job prévu pour {todayName}</p>
          <p className="text-xs text-gray-400 mt-2">Les ouvertures, fermetures et entretiens planifiés apparaissent ici.</p>
        </div>
      ) : allDone ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="font-bold text-green-900">Journée terminée!</p>
          <p className="text-sm text-green-700 mt-1">{stops.length} stops complétés</p>
        </div>
      ) : (
        <>
          <button
            onClick={navigateAll}
            className="w-full bg-blue-600 text-white rounded-xl py-4 font-bold text-base flex items-center justify-center gap-2 hover:bg-blue-700"
          >
            <Navigation size={20} /> Google Maps — {remaining.length} arrêts restants
          </button>

          <div className="space-y-2">
            {stops.map((stop, idx) => {
              const done = isDone(stop);
              const badge = JOB_BADGE[stop.jobType] || JOB_BADGE.autre;
              return (
                <div key={stop.key} className={`bg-white rounded-xl border p-4 transition-opacity ${done ? "opacity-40" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${done ? "bg-green-500" : "bg-[#0a1f3f]"}`}>
                      {done ? "✓" : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold text-gray-900 ${done ? "line-through" : ""}`}>{stop.contactName}</p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: badge.color, backgroundColor: badge.bg }}>
                          {badge.label}
                        </span>
                        {stop.fromRouteState && (
                          <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded-full">route récurrente</span>
                        )}
                      </div>
                      {stop.address && (
                        <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1">
                          <MapPin size={11} className="mt-0.5 flex-shrink-0" /> {stop.address}
                        </p>
                      )}
                      {(stop.startTime || stop.endTime) && (
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Clock size={11} />
                          {stop.startTime}{stop.endTime ? ` → ${stop.endTime}` : ""}
                        </p>
                      )}

                      {stop.jobId && employees.length > 0 && (
                        <div className="mt-2">
                          <select
                            value={stop.assignedEmployeeId ?? ""}
                            onChange={e => assignJob(stop.jobId!, e.target.value || null)}
                            className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-gray-50 focus:outline-none focus:border-blue-300"
                          >
                            <option value="">— Non assigné</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {!done && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => navigateToStop(stop)}
                            className="flex-1 bg-blue-50 text-blue-700 rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1 hover:bg-blue-100">
                            <Navigation size={12} /> Naviguer
                          </button>
                          {stop.phone && (
                            <a href={`tel:${stop.phone}`}
                              className="bg-gray-100 text-gray-700 rounded-lg py-2 px-3 text-xs font-medium flex items-center justify-center hover:bg-gray-200">
                              <Phone size={12} />
                            </a>
                          )}
                          <label className="cursor-pointer flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-200">
                            {photoUploading === stop.contactId
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Camera size={12} />}
                            Photo
                            <input type="file" accept="image/*" capture="environment" className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoCapture(stop.contactId, file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            onClick={() => setChecklistStop({ name: stop.contactName, id: stop.contactId, jobType: stop.jobType })}
                            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1 hover:bg-green-700">
                            <Check size={12} /> Fait
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {checklistStop && (
        <PostVisitChecklist
          clientName={checklistStop.name}
          clientId={checklistStop.id}
          jobType={checklistStop.jobType}
          onClose={() => setChecklistStop(null)}
          onComplete={() => {
            const stop = stops.find(s => s.contactId === checklistStop.id);
            if (stop) markAsDone(stop);
            setChecklistStop(null);
          }}
        />
      )}
    </div>
  );
}
