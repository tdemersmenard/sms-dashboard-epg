"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  format, eachDayOfInterval, isToday, parseISO, addDays, addMonths, addWeeks,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameMonth,
  startOfDay, subDays, subWeeks, subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Check, X, Clock } from "lucide-react";

type JobType = "ouverture" | "fermeture" | "entretien" | "réparation" | "spa" | "autre";

const JOB_TYPE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  ouverture:  { bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-300",  dot: "bg-emerald-500" },
  fermeture:  { bg: "bg-orange-50",   text: "text-orange-700",   border: "border-orange-300",   dot: "bg-orange-500" },
  entretien:  { bg: "bg-blue-50",     text: "text-blue-700",     border: "border-blue-300",     dot: "bg-blue-500" },
  réparation: { bg: "bg-red-50",      text: "text-red-700",      border: "border-red-300",      dot: "bg-red-500" },
  spa:        { bg: "bg-purple-50",   text: "text-purple-700",   border: "border-purple-300",   dot: "bg-purple-500" },
  autre:      { bg: "bg-gray-50",     text: "text-gray-700",     border: "border-gray-300",     dot: "bg-gray-500" },
};

interface JobWithContact {
  id: string;
  contact_id: string;
  job_type: JobType;
  scheduled_date: string;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  status: string;
  notes: string | null;
  confirmed_at: string | null;
  contactName: string;
  contactPhone: string;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
}

type ViewMode = "day" | "week" | "month";

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "week";
    return (localStorage.getItem("calendar_view") as ViewMode) || "week";
  });

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (typeof window === "undefined") return new Date();
    const saved = localStorage.getItem("calendar_date");
    return saved ? new Date(saved) : new Date();
  });

  const [jobs, setJobs] = useState<JobWithContact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobWithContact | null>(null);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [jobForm, setJobForm] = useState({
    contact_id: "",
    job_type: "entretien" as JobType,
    scheduled_date: format(new Date(), "yyyy-MM-dd"),
    scheduled_time_start: "08:00",
    scheduled_time_end: "10:00",
    notes: "",
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("calendar_view", viewMode);
      localStorage.setItem("calendar_date", currentDate.toISOString());
    }
  }, [viewMode, currentDate]);

  const loadJobs = useCallback(async () => {
    let from: Date, to: Date;
    if (viewMode === "day") {
      from = startOfDay(currentDate);
      to = startOfDay(currentDate);
    } else if (viewMode === "week") {
      from = startOfWeek(currentDate, { weekStartsOn: 1 });
      to = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      from = startOfMonth(currentDate);
      to = endOfMonth(currentDate);
    }

    const fromStr = format(from, "yyyy-MM-dd");
    const toStr = format(to, "yyyy-MM-dd");

    const { data: jobsData } = await supabaseBrowser
      .from("jobs")
      .select("*")
      .gte("scheduled_date", fromStr)
      .lte("scheduled_date", toStr)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time_start", { ascending: true });

    if (jobsData) {
      const contactIds = Array.from(new Set(jobsData.map((j) => j.contact_id)));
      const { data: contactsData } = await supabaseBrowser
        .from("contacts")
        .select("id, first_name, last_name, phone")
        .in("id", contactIds);

      const contactMap = new Map(contactsData?.map((c) => [c.id, c]) || []);
      const enriched = jobsData.map((j) => {
        const c = contactMap.get(j.contact_id);
        return {
          ...j,
          contactName: c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : "Inconnu",
          contactPhone: (c as any)?.phone || "",
        };
      });
      setJobs(enriched as JobWithContact[]);
    }
  }, [viewMode, currentDate]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    supabaseBrowser
      .from("contacts")
      .select("id, first_name, last_name, phone")
      .order("first_name", { ascending: true })
      .then(({ data }) => setContacts(data || []));
  }, []);

  const navigatePrev = () => {
    if (viewMode === "day") setCurrentDate(subDays(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const navigateNext = () => {
    if (viewMode === "day") setCurrentDate(addDays(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const goToday = () => setCurrentDate(new Date());

  const confirmOpening = async (jobId: string) => {
    if (!confirm("Envoyer le SMS de confirmation au client?")) return;
    setConfirmingId(jobId);
    try {
      const res = await fetch("/api/jobs/confirm-opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        await loadJobs();
        setSelectedJob(null);
      }
    } finally {
      setConfirmingId(null);
    }
  };

  const unconfirmOpening = async (jobId: string) => {
    if (!confirm("Annuler la confirmation?")) return;
    await fetch("/api/jobs/unconfirm-opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    await loadJobs();
    setSelectedJob(null);
  };

  const handleNewJob = async () => {
    if (!jobForm.contact_id || savingJob) return;
    setSavingJob(true);

    if (jobForm.job_type === "ouverture" || jobForm.job_type === "fermeture") {
      const { data: existing } = await supabaseBrowser
        .from("jobs")
        .select("id, scheduled_date")
        .eq("contact_id", jobForm.contact_id)
        .eq("job_type", jobForm.job_type)
        .limit(1);

      if (existing && existing.length > 0) {
        alert(`Ce client a déjà une ${jobForm.job_type} planifiée le ${existing[0].scheduled_date}. Supprimez-la d'abord si vous voulez la déplacer.`);
        setSavingJob(false);
        return;
      }
    }

    await supabaseBrowser.from("jobs").insert({
      contact_id: jobForm.contact_id,
      job_type: jobForm.job_type,
      scheduled_date: jobForm.scheduled_date,
      scheduled_time_start: jobForm.scheduled_time_start,
      scheduled_time_end: jobForm.scheduled_time_end,
      status: "planifié",
      notes: jobForm.notes || null,
    });

    if (jobForm.job_type === "ouverture") {
      await supabaseBrowser
        .from("contacts")
        .update({ ouverture_date: jobForm.scheduled_date })
        .eq("id", jobForm.contact_id);
    }

    setSavingJob(false);
    setShowNewJobModal(false);
    setJobForm({ ...jobForm, contact_id: "", notes: "" });
    await loadJobs();
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm("Supprimer ce rendez-vous?")) return;
    await supabaseBrowser.from("jobs").delete().eq("id", jobId);
    setSelectedJob(null);
    await loadJobs();
  };

  const headerLabel = () => {
    if (viewMode === "day") return format(currentDate, "EEEE d MMMM yyyy", { locale: fr });
    if (viewMode === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, "d MMM", { locale: fr })} – ${format(end, "d MMM yyyy", { locale: fr })}`;
    }
    return format(currentDate, "MMMM yyyy", { locale: fr });
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{headerLabel()}</h1>
          <p className="text-sm text-gray-500">{jobs.length} rendez-vous</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(["day", "week", "month"] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === v ? "bg-white text-[#0a1f3f] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              >
                {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
              </button>
            ))}
          </div>
          <button onClick={navigatePrev} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200">
            <ChevronLeft size={18} />
          </button>
          <button onClick={goToday} className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200">
            Aujourd&apos;hui
          </button>
          <button onClick={navigateNext} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200">
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setShowNewJobModal(true)}
            className="bg-[#0a1f3f] text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-[#0d2a52]"
          >
            <Plus size={16} /> Nouveau
          </button>
        </div>
      </div>

      {/* VUE JOUR */}
      {viewMode === "day" && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className={`px-4 py-3 border-b ${isToday(currentDate) ? "bg-blue-50" : ""}`}>
            <p className="text-sm text-gray-500 uppercase">{format(currentDate, "EEEE", { locale: fr })}</p>
            <p className="text-2xl font-bold text-gray-900">{format(currentDate, "d MMMM", { locale: fr })}</p>
          </div>
          <div className="divide-y">
            {jobs.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">Aucun rendez-vous</p>
            ) : (
              jobs.map((job) => {
                const colors = JOB_TYPE_COLORS[job.job_type] || JOB_TYPE_COLORS.autre;
                const isConfirmed = !!job.confirmed_at;
                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${isConfirmed ? "border-l-4 border-l-green-500" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${colors.dot}`}></span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{job.contactName}</p>
                            {isConfirmed && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                                <Check size={10} /> Confirmé
                              </span>
                            )}
                          </div>
                          <p className={`text-xs ${colors.text} font-medium capitalize`}>{job.job_type}</p>
                          {job.notes && <p className="text-xs text-gray-500 mt-1">{job.notes}</p>}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500 flex-shrink-0">
                        <p className="font-semibold text-gray-900 flex items-center gap-1">
                          <Clock size={12} /> {job.scheduled_time_start?.slice(0, 5) || "?"}
                        </p>
                        <p>{job.scheduled_time_end?.slice(0, 5)}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VUE SEMAINE */}
      {viewMode === "week" && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="grid grid-cols-7 divide-x">
            {eachDayOfInterval({
              start: startOfWeek(currentDate, { weekStartsOn: 1 }),
              end: endOfWeek(currentDate, { weekStartsOn: 1 }),
            }).map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayJobs = jobs.filter((j) => j.scheduled_date === dateStr);
              return (
                <div key={dateStr} className="min-h-[300px]">
                  <div className={`p-2 text-center border-b ${isToday(day) ? "bg-blue-50" : ""}`}>
                    <p className="text-[10px] text-gray-500 uppercase">{format(day, "EEE", { locale: fr })}</p>
                    <p className={`text-sm font-bold ${isToday(day) ? "text-blue-600" : "text-gray-900"}`}>{format(day, "d")}</p>
                  </div>
                  <div className="p-1.5 space-y-1">
                    {dayJobs.map((job) => {
                      const colors = JOB_TYPE_COLORS[job.job_type] || JOB_TYPE_COLORS.autre;
                      const isConfirmed = !!job.confirmed_at;
                      return (
                        <div
                          key={job.id}
                          onClick={() => setSelectedJob(job)}
                          className={`text-[10px] p-1.5 rounded cursor-pointer ${colors.bg} border ${colors.border} hover:shadow-sm ${isConfirmed ? "ring-2 ring-green-400" : ""}`}
                        >
                          <p className={`font-semibold ${colors.text} truncate`}>{job.scheduled_time_start?.slice(0, 5)}</p>
                          <p className="text-gray-700 truncate">{job.contactName}</p>
                          {isConfirmed && <p className="text-green-600 font-bold">✓ OK</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VUE MOIS */}
      {viewMode === "month" && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="grid grid-cols-7 border-b text-center text-xs text-gray-500 uppercase">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {eachDayOfInterval({
              start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
              end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
            }).map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayJobs = jobs.filter((j) => j.scheduled_date === dateStr);
              const inMonth = isSameMonth(day, currentDate);
              return (
                <div
                  key={dateStr}
                  className={`min-h-[100px] border-r border-b p-1 ${inMonth ? "bg-white" : "bg-gray-50"} ${isToday(day) ? "ring-2 ring-inset ring-blue-400" : ""}`}
                >
                  <p className={`text-xs font-semibold ${inMonth ? "text-gray-900" : "text-gray-400"} ${isToday(day) ? "text-blue-600" : ""}`}>
                    {format(day, "d")}
                  </p>
                  <div className="space-y-0.5 mt-1">
                    {dayJobs.slice(0, 3).map(job => {
                      const colors = JOB_TYPE_COLORS[job.job_type] || JOB_TYPE_COLORS.autre;
                      return (
                        <div
                          key={job.id}
                          onClick={() => setSelectedJob(job)}
                          className={`text-[9px] px-1 py-0.5 rounded cursor-pointer ${colors.bg} ${colors.text} truncate ${job.confirmed_at ? "border-l-2 border-green-500" : ""}`}
                        >
                          {job.scheduled_time_start?.slice(0, 5)} {job.contactName}
                        </div>
                      );
                    })}
                    {dayJobs.length > 3 && <p className="text-[9px] text-gray-500">+{dayJobs.length - 3}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL JOB */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 capitalize">{selectedJob.job_type}</p>
                <p className="text-lg font-bold text-gray-900">{selectedJob.contactName}</p>
                {selectedJob.confirmed_at && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 inline-flex items-center gap-1 mt-1">
                    <Check size={10} /> Confirmé
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedJob(null)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-gray-600 space-y-1">
                <p>📅 {format(parseISO(selectedJob.scheduled_date), "EEEE d MMMM yyyy", { locale: fr })}</p>
                <p>⏰ {selectedJob.scheduled_time_start?.slice(0, 5)} – {selectedJob.scheduled_time_end?.slice(0, 5)}</p>
                {selectedJob.notes && <p className="mt-2">📝 {selectedJob.notes}</p>}
              </div>

              {selectedJob.job_type === "ouverture" && !selectedJob.confirmed_at && (
                <button
                  onClick={() => confirmOpening(selectedJob.id)}
                  disabled={confirmingId === selectedJob.id}
                  className="w-full bg-green-600 text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check size={16} /> {confirmingId === selectedJob.id ? "Envoi..." : "Confirmer + envoyer SMS au client"}
                </button>
              )}

              {selectedJob.job_type === "ouverture" && selectedJob.confirmed_at && (
                <button
                  onClick={() => unconfirmOpening(selectedJob.id)}
                  className="w-full bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-medium"
                >
                  Annuler la confirmation
                </button>
              )}

              <button onClick={() => deleteJob(selectedJob.id)} className="w-full bg-red-50 text-red-700 rounded-lg py-2 text-sm font-medium hover:bg-red-100">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NEW JOB */}
      {showNewJobModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowNewJobModal(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <p className="font-bold text-gray-900">Nouveau rendez-vous</p>
              <button onClick={() => setShowNewJobModal(false)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700">Client</label>
                <select
                  value={jobForm.contact_id}
                  onChange={(e) => setJobForm({ ...jobForm, contact_id: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Sélectionner un client</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name || ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Type</label>
                <select
                  value={jobForm.job_type}
                  onChange={(e) => setJobForm({ ...jobForm, job_type: e.target.value as JobType })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="ouverture">Ouverture</option>
                  <option value="fermeture">Fermeture</option>
                  <option value="entretien">Entretien</option>
                  <option value="réparation">Réparation</option>
                  <option value="spa">Spa</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700">Date</label>
                  <input type="date" value={jobForm.scheduled_date} onChange={(e) => setJobForm({ ...jobForm, scheduled_date: e.target.value })} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Heure début</label>
                  <input type="time" value={jobForm.scheduled_time_start} onChange={(e) => setJobForm({ ...jobForm, scheduled_time_start: e.target.value })} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <textarea value={jobForm.notes} onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <button
                onClick={handleNewJob}
                disabled={!jobForm.contact_id || savingJob}
                className="w-full bg-[#0a1f3f] text-white rounded-lg py-3 font-medium disabled:opacity-50"
              >
                {savingJob ? "Création..." : "Créer le rendez-vous"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
