"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "@/components/FranchiseProvider";
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
  const { franchiseId } = useFranchise();
  const [loading, setLoading] = useState(true);
  const [todayName, setTodayName] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [checklistStop, setChecklistStop] = useState<{ name: string; id: string; jobType: string } | null>(null);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!franchiseId) return;
    loadToday();
    fetch("/api/employes/list").then(r => r.json()).then(d => setEmployees(d.employees || []));
  }, [franchiseId]);

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
      .eq("franchise_id", franchiseId)
      .eq("scheduled_date", todayStr)
      .in("status", ["planifié", "confirmé", "en_cours"])
      .order("scheduled_time_start", { ascending: true, nullsFirst: false });

    // 2. Fetch contacts for those jobs (include assigned_employee_id for per-client display)
    const jobContactIds = (jobs || []).map(j => j.contact_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactMap = new Map<string, any>();
    if (jobContactIds.length > 0) {
      const { data: contacts } = await supabaseBrowser
        .from("contacts")
        .select("id, first_name, last_name, phone, address, assigned_employee_id")
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
        // Use contact-level assignment (contact is the source of truth)
        assignedEmployeeId: contactMap.get(j.contact_id)?.assigned_employee_id ?? (j as any).assigned_employee_id ?? null,
      };
    });

    // 4. Load route_state for recurring entretiens not yet confirmed (no job entry today)
    const { data: routeState } = await supabaseBrowser
      .from("route_state").select("data").eq("franchise_id", franchiseId).maybeSingle();

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
      .from("jobs").select("id, contact_id").eq("franchise_id", franchiseId).eq("scheduled_date", todayStr).eq("status", "complété");
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

  const assignClient = async (contactId: string, employeeId: string | null) => {
    await fetch("/api/contacts/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, employeeId: employeeId || null }),
    });
    // Update all stops for this contact (a contact can appear multiple times)
    setStops(prev => prev.map(s => s.contactId === contactId ? { ...s, assignedEmployeeId: employeeId } : s));
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
        <Link href="/routes" className="p-2 bg-chip rounded-lg hover:bg-chip">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold font-display text-ink">Itinéraire {todayName}</h1>
          <p className="text-xs text-mut num">{stops.length - remaining.length} / {stops.length} complétés</p>
        </div>
        <button onClick={loadToday} className="p-2 bg-chip rounded-lg hover:bg-chip" title="Rafraîchir">
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-mut" />
        </div>
      ) : stops.length === 0 ? (
        <div className="bg-sur rounded-xl border border-line p-8 text-center">
          <p className="text-mut">Aucun job prévu pour {todayName}</p>
          <p className="text-xs text-mut mt-2">Les ouvertures, fermetures et entretiens planifiés apparaissent ici.</p>
        </div>
      ) : allDone ? (
        <div className="bg-chip border border-line rounded-xl p-6 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="font-bold font-display text-pos">Journée terminée!</p>
          <p className="text-sm text-pos mt-1">{stops.length} stops complétés</p>
        </div>
      ) : (
        <>
          <button
            onClick={navigateAll}
            className="w-full btn-glow rounded-xl py-4 font-bold text-base flex items-center justify-center gap-2 hover:opacity-90"
          >
            <Navigation size={20} /> Google Maps — {remaining.length} arrêts restants
          </button>

          <div className="space-y-2">
            {stops.map((stop, idx) => {
              const done = isDone(stop);
              const badge = JOB_BADGE[stop.jobType] || JOB_BADGE.autre;
              return (
                <div key={stop.key} className={`bg-sur rounded-xl border border-line p-4 transition-opacity ${done ? "opacity-40" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold num flex-shrink-0 ${done ? "bg-pos text-white" : "bg-acc-grad text-accink"}`}>
                      {done ? "✓" : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold text-ink ${done ? "line-through" : ""}`}>{stop.contactName}</p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: badge.color, backgroundColor: badge.bg }}>
                          {badge.label}
                        </span>
                        {stop.fromRouteState && (
                          <span className="text-[10px] text-mut px-1.5 py-0.5 bg-chip rounded-full">route récurrente</span>
                        )}
                      </div>
                      {stop.address && (
                        <p className="text-xs text-mut mt-0.5 flex items-start gap-1">
                          <MapPin size={11} className="mt-0.5 flex-shrink-0" /> {stop.address}
                        </p>
                      )}
                      {(stop.startTime || stop.endTime) && (
                        <p className="text-xs text-mut mt-0.5 flex items-center gap-1">
                          <Clock size={11} />
                          {stop.startTime}{stop.endTime ? ` → ${stop.endTime}` : ""}
                        </p>
                      )}

                      {employees.length > 0 && (
                        <div className="mt-2">
                          <select
                            value={stop.assignedEmployeeId ?? ""}
                            onChange={e => assignClient(stop.contactId, e.target.value || null)}
                            className="w-full text-[10px] border border-line rounded px-1.5 py-1 text-mut bg-page focus:outline-none focus:border-acc"
                          >
                            <option value="">— Thomas (tous les jobs)</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name} (tous les jobs)</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {!done && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => navigateToStop(stop)}
                            className="flex-1 bg-chip text-acc rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1 hover:opacity-80">
                            <Navigation size={12} /> Naviguer
                          </button>
                          {stop.phone && (
                            <a href={`tel:${stop.phone}`}
                              className="bg-chip text-ink rounded-lg py-2 px-3 text-xs font-medium flex items-center justify-center hover:bg-chip">
                              <Phone size={12} />
                            </a>
                          )}
                          <label className="cursor-pointer flex items-center justify-center gap-1 px-3 py-2 bg-chip rounded-lg text-xs font-medium text-ink hover:bg-chip">
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
                            className="flex-1 bg-pos text-white rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1 hover:opacity-90">
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
