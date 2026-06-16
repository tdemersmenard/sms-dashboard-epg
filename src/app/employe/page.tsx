"use client";

import { useState, useEffect, useCallback } from "react";
import { Navigation, Check, Phone, MapPin, Clock, Camera, Loader2, ChevronLeft, ChevronRight, Droplets, Plus } from "lucide-react";
import PostVisitChecklist from "@/components/PostVisitChecklist";

const JOB_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  entretien: { label: "Entretien",  color: "#3b82f6", bg: "#eff6ff" },
  ouverture: { label: "Ouverture",  color: "#10b981", bg: "#f0fdf4" },
  fermeture: { label: "Fermeture",  color: "#f97316", bg: "#fff7ed" },
  visite:    { label: "Visite",     color: "#a855f7", bg: "#faf5ff" },
  autre:     { label: "Autre",      color: "#6b7280", bg: "#f9fafb" },
};

const WATER_NORMS = {
  ph:               { min: 7.2,  max: 7.6,  label: "pH",                 unit: ""     },
  alkalinity:       { min: 80,   max: 120,  label: "Alcalinité",         unit: "ppm"  },
  chlorine:         { min: 1,    max: 3,    label: "Chlore libre",       unit: "ppm"  },
  calcium_hardness: { min: 200,  max: 400,  label: "Dureté calcique",    unit: "ppm"  },
  stabilizer:       { min: 30,   max: 50,   label: "Stabilisant",        unit: "ppm"  },
};

function statusOf(val: number | null, norm: { min: number; max: number }): "ok" | "warn" | "bad" | "none" {
  if (val === null || val === undefined) return "none";
  if (val >= norm.min && val <= norm.max) return "ok";
  if (val < norm.min * 0.8 || val > norm.max * 1.3) return "bad";
  return "warn";
}

const STATUS_COLORS = {
  ok:   "text-green-700 bg-green-50",
  warn: "text-yellow-700 bg-yellow-50",
  bad:  "text-red-700 bg-red-50",
  none: "text-gray-400 bg-gray-50",
};

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

export default function EmployeDashboard() {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [jobs, setJobs] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [checklistStop, setChecklistStop] = useState<{ name: string; id: string; jobType: string; jobId: string } | null>(null);
  const [showWaterForm, setShowWaterForm] = useState<string | null>(null); // contactId
  const [waterForm, setWaterForm] = useState({ ph: "", alkalinity: "", chlorine: "", calcium_hardness: "", stabilizer: "", notes: "" });
  const [savingWater, setSavingWater] = useState(false);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employe/jobs?date=${date}`, { cache: "no-store" });
      const data = await res.json();
      if (data.migrationRequired) {
        setMigrationRequired(true);
      } else {
        setJobs(data.jobs || []);
        setDoneIds(new Set(
          (data.jobs || []).filter((j: any) => j.status === "complété").map((j: any) => j.id) // eslint-disable-line @typescript-eslint/no-explicit-any
        ));
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const changeDate = (delta: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(toDateStr(d));
  };

  const markDone = async (job: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    await fetch("/api/employe/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, status: "complété" }),
    });
    setDoneIds(prev => new Set(Array.from(prev).concat([job.id])));
  };

  const handlePhotoCapture = async (contactId: string, file: File) => {
    setPhotoUploading(contactId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contactId", contactId);
      formData.append("type", "photo_employe");
      await fetch("/api/photos/upload", { method: "POST", body: formData });
    } catch (e) {
      console.error("Erreur upload photo:", e);
    } finally {
      setPhotoUploading(null);
    }
  };

  const handleSaveWater = async (contactId: string) => {
    setSavingWater(true);
    try {
      await fetch("/api/water-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, ...waterForm }),
      });
      setShowWaterForm(null);
      setWaterForm({ ph: "", alkalinity: "", chlorine: "", calcium_hardness: "", stabilizer: "", notes: "" });
    } finally {
      setSavingWater(false);
    }
  };

  const navigate = (job: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const dest = encodeURIComponent(job.contacts?.address || `${job.contacts?.first_name} ${job.contacts?.last_name}`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, "_blank");
  };

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  const remaining = jobs.filter(j => !doneIds.has(j.id));

  if (migrationRequired) {
    return (
      <div className="p-4 text-center py-12">
        <p className="text-gray-500 text-sm">Le système d&apos;attribution des jobs par employé n&apos;est pas encore configuré.</p>
        <p className="text-gray-400 text-xs mt-2">Contactez Thomas pour activer cette fonctionnalité.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      {/* Date picker */}
      <div className="flex items-center gap-3 justify-center">
        <button onClick={() => changeDate(-1)} className="p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="font-semibold text-gray-900 capitalize">{dateLabel}</p>
          <p className="text-xs text-gray-400">{remaining.length} job{remaining.length !== 1 ? "s" : ""} restant{remaining.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => changeDate(1)} className="p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <p className="text-gray-500">Aucun job assigné pour cette journée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job, idx) => {
            const done = doneIds.has(job.id);
            const badge = JOB_BADGE[job.job_type] || JOB_BADGE.autre;
            const c = job.contacts;
            const name = c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Inconnu" : "Inconnu";
            return (
              <div key={job.id} className={`bg-white rounded-xl border p-4 transition-opacity ${done ? "opacity-40" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${done ? "bg-green-500" : "bg-[#0a1f3f]"}`}>
                    {done ? "✓" : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-semibold text-gray-900 ${done ? "line-through" : ""}`}>{name}</p>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: badge.color, backgroundColor: badge.bg }}>
                        {badge.label}
                      </span>
                    </div>
                    {c?.address && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1">
                        <MapPin size={11} className="mt-0.5 flex-shrink-0" /> {c.address}
                      </p>
                    )}
                    {(job.scheduled_time_start || job.scheduled_time_end) && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Clock size={11} />
                        {job.scheduled_time_start?.slice(0, 5)}{job.scheduled_time_end ? ` → ${job.scheduled_time_end.slice(0, 5)}` : ""}
                      </p>
                    )}
                    {c?.notes && (
                      <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1 mt-1">{c.notes}</p>
                    )}

                    {!done && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => navigate(job)}
                          className="flex-1 bg-blue-50 text-blue-700 rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1 hover:bg-blue-100 min-w-[80px]">
                          <Navigation size={12} /> Naviguer
                        </button>
                        {c?.phone && (
                          <a href={`tel:${c.phone}`}
                            className="bg-gray-100 text-gray-700 rounded-lg py-2 px-3 text-xs font-medium flex items-center justify-center hover:bg-gray-200">
                            <Phone size={12} />
                          </a>
                        )}
                        <button onClick={() => { setShowWaterForm(c?.id); setWaterForm({ ph: "", alkalinity: "", chlorine: "", calcium_hardness: "", stabilizer: "", notes: "" }); }}
                          className="bg-blue-100 text-blue-700 rounded-lg py-2 px-3 text-xs font-medium flex items-center justify-center gap-1 hover:bg-blue-200">
                          <Droplets size={12} /> Analyse
                        </button>
                        <label className="cursor-pointer flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-200">
                          {photoUploading === c?.id ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                          Photo
                          <input type="file" accept="image/*" capture="environment" className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file && c?.id) handlePhotoCapture(c.id, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <button
                          onClick={() => setChecklistStop({ name, id: c?.id, jobType: job.job_type, jobId: job.id })}
                          className="flex-1 bg-green-600 text-white rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1 hover:bg-green-700 min-w-[80px]">
                          <Check size={12} /> Fait
                        </button>
                      </div>
                    )}

                    {/* Water test form inline */}
                    {showWaterForm === c?.id && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2 mb-2">
                          <Droplets size={14} className="text-blue-600" />
                          <p className="text-xs font-semibold text-blue-800">Analyse d&apos;eau</p>
                          <button onClick={() => setShowWaterForm(null)} className="ml-auto text-blue-400 hover:text-blue-600">
                            ×
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(Object.entries(WATER_NORMS) as [keyof typeof WATER_NORMS, typeof WATER_NORMS[keyof typeof WATER_NORMS]][]).map(([key, norm]) => {
                            const val = waterForm[key as keyof typeof waterForm];
                            const numVal = val !== "" ? Number(val) : null;
                            const st = statusOf(numVal, norm);
                            return (
                              <div key={key}>
                                <label className="block text-[10px] text-gray-500 mb-0.5">
                                  {norm.label} <span className="text-gray-400">({norm.min}–{norm.max}{norm.unit})</span>
                                </label>
                                <div className="flex gap-1">
                                  <input type="number" step="0.1" value={val}
                                    onChange={e => setWaterForm(f => ({ ...f, [key]: e.target.value }))}
                                    className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                                    placeholder="—" />
                                  {st !== "none" && (
                                    <span className={`text-[9px] px-1.5 py-1 rounded flex items-center font-medium ${STATUS_COLORS[st]}`}>
                                      {st === "ok" ? "✓" : st === "warn" ? "!" : "✗"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <input type="text" value={waterForm.notes} onChange={e => setWaterForm(f => ({ ...f, notes: e.target.value }))}
                          className="w-full mt-2 px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                          placeholder="Notes optionnelles..." />
                        <button onClick={() => handleSaveWater(c?.id)} disabled={savingWater}
                          className="mt-2 w-full py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
                          <Plus size={12} /> {savingWater ? "Sauvegarde..." : "Enregistrer l'analyse"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {checklistStop && (
        <PostVisitChecklist
          clientName={checklistStop.name}
          clientId={checklistStop.id}
          jobType={checklistStop.jobType}
          onClose={() => setChecklistStop(null)}
          onComplete={() => {
            const job = jobs.find(j => j.id === checklistStop.jobId);
            if (job) markDone(job);
            setChecklistStop(null);
          }}
        />
      )}
    </div>
  );
}
