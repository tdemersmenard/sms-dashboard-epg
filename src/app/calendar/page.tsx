"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  format, eachDayOfInterval, isToday, parseISO,
} from "date-fns";
import { fr } from "date-fns/locale";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Job, Contact } from "@/lib/types";

const HOUR_START = 8;
const HOUR_END = 20;
const HOUR_HEIGHT = 64; // px per hour

const JOB_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  ouverture: { bg: "bg-green-100",  border: "border-green-500",  text: "text-green-800" },
  entretien: { bg: "bg-blue-100",   border: "border-blue-500",   text: "text-blue-800" },
  fermeture: { bg: "bg-orange-100", border: "border-orange-500", text: "text-orange-800" },
  visite:    { bg: "bg-purple-100", border: "border-purple-500", text: "text-purple-800" },
  autre:     { bg: "bg-gray-100",   border: "border-gray-500",   text: "text-gray-800" },
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

function minutesFromDayStart(t: string): number {
  return timeToMinutes(t) - HOUR_START * 60;
}

type JobWithContact = Job & { contactName: string };

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [jobs, setJobs] = useState<JobWithContact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobWithContact | null>(null);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [jobForm, setJobForm] = useState({
    contact_id: "",
    job_type: "ouverture" as Job["job_type"],
    scheduled_date: "",
    scheduled_time_start: "08:00",
    scheduled_time_end: "10:00",
    notes: "",
  });
  const [contactSearch, setContactSearch] = useState("");

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const loadJobs = useCallback(async () => {
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(weekEnd, "yyyy-MM-dd");
    const { data } = await supabaseBrowser
      .from("jobs")
      .select("*")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to);
    if (!data) return;

    // fetch contacts for names
    const contactIds = Array.from(new Set(data.map((j) => j.contact_id)));
    let contactMap: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: cs } = await supabaseBrowser
        .from("contacts")
        .select("id,first_name,last_name,name,phone")
        .in("id", contactIds);
      if (cs) {
        contactMap = Object.fromEntries(
          cs.map((c) => {
            const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
            const last = c.last_name && c.last_name?.trim() !== "" ? c.last_name : null;
            const name = first || last ? [first, last].filter(Boolean).join(" ") : (c.name && c.name !== "Inconnu" ? c.name : c.phone);
            return [c.id, name];
          })
        );
      }
    }
    setJobs(data.map((j) => ({ ...j, contactName: contactMap[j.contact_id] ?? "Client" })) as JobWithContact[]);
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    supabaseBrowser
      .from("contacts")
      .select("id,first_name,last_name,name,phone")
      .order("first_name")
      .then(({ data }) => setContacts((data ?? []) as Contact[]));
  }, []);

  const openNewJob = (date: string, time: string) => {
    setJobForm((p) => ({ ...p, scheduled_date: date, scheduled_time_start: time, scheduled_time_end: "" }));
    setShowNewJobModal(true);
  };

  const handleJobCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobForm.contact_id || !jobForm.scheduled_date) return;
    setSavingJob(true);
    await supabaseBrowser.from("jobs").insert({
      contact_id: jobForm.contact_id,
      job_type: jobForm.job_type,
      scheduled_date: jobForm.scheduled_date,
      scheduled_time_start: jobForm.scheduled_time_start || null,
      scheduled_time_end: jobForm.scheduled_time_end || null,
      notes: jobForm.notes || null,
      status: "planifié",
    });
    await loadJobs();
    setShowNewJobModal(false);
    setSavingJob(false);
    setJobForm({ contact_id: "", job_type: "ouverture", scheduled_date: "", scheduled_time_start: "08:00", scheduled_time_end: "10:00", notes: "" });
    setContactSearch("");
  };

  const filteredContacts = contacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    if (!q) return true;
    const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
    const last = c.last_name && c.last_name?.trim() !== "" ? c.last_name : null;
    const name = first || last ? [first, last].filter(Boolean).join(" ") : (c.phone ?? "");
    return name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
  });

  const totalH = (HOUR_END - HOUR_START) * HOUR_HEIGHT;
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekStart((w) => subWeeks(w, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-base font-bold text-gray-900">
            Semaine du {format(weekStart, "d MMMM yyyy", { locale: fr })}
          </h1>
          <button onClick={() => setWeekStart((w) => addWeeks(w, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
        >
          Aujourd&apos;hui
        </button>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full">
          {/* Time column */}
          <div className="flex-shrink-0 w-14 border-r border-gray-200 bg-white">
            <div className="h-10 border-b border-gray-200" />
            <div className="relative" style={{ height: totalH }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 flex items-start justify-end pr-2"
                  style={{ top: (h - HOUR_START) * HOUR_HEIGHT - 8 }}
                >
                  <span className="text-[10px] text-gray-400">{h}h</span>
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          <div className="flex flex-1 divide-x divide-gray-200 bg-white">
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayJobs = jobs.filter((j) => j.scheduled_date === dateStr);

              return (
                <div key={dateStr} className="flex-1 flex flex-col min-w-0">
                  {/* Day header */}
                  <div className={`h-10 flex flex-col items-center justify-center border-b border-gray-200 flex-shrink-0 ${isToday(day) ? "bg-blue-50" : ""}`}>
                    <span className="text-[10px] text-gray-500 uppercase">{format(day, "EEE", { locale: fr })}</span>
                    <span className={`text-sm font-semibold ${isToday(day) ? "text-blue-600" : "text-gray-800"}`}>
                      {format(day, "d")}
                    </span>
                  </div>

                  {/* Hour cells + job blocks */}
                  <div
                    className="relative flex-1"
                    style={{ height: totalH }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const totalMinutes = (y / totalH) * (HOUR_END - HOUR_START) * 60;
                      const h = Math.floor(totalMinutes / 60) + HOUR_START;
                      const m = Math.round((totalMinutes % 60) / 30) * 30;
                      const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                      openNewJob(dateStr, time);
                    }}
                  >
                    {/* Hour lines */}
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                      />
                    ))}

                    {/* Job blocks */}
                    {dayJobs.map((job) => {
                      const startT = job.scheduled_time_start ?? `${HOUR_START}:00`;
                      const endT = job.scheduled_time_end ?? `${Math.min(timeToMinutes(startT) / 60 + 1, HOUR_END)}:00`;
                      const topMin = minutesFromDayStart(startT);
                      const durationMin = timeToMinutes(endT) - timeToMinutes(startT);
                      const topPx = (topMin / 60) * HOUR_HEIGHT;
                      const heightPx = Math.max((durationMin / 60) * HOUR_HEIGHT, 24);
                      const c = JOB_TYPE_COLORS[job.job_type] ?? JOB_TYPE_COLORS.autre;

                      return (
                        <div
                          key={job.id}
                          className={`absolute left-1 right-1 rounded border-l-2 px-1.5 py-0.5 overflow-hidden cursor-pointer hover:opacity-90 ${c.bg} ${c.border} ${c.text}`}
                          style={{ top: topPx, height: heightPx }}
                          onClick={(e) => { e.stopPropagation(); setSelectedJob(job); }}
                        >
                          <p className="text-[10px] font-semibold truncate">{job.contactName}</p>
                          <p className="text-[10px] truncate">{startT}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Job detail popup */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-72 mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-gray-900">{selectedJob.contactName}</p>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${JOB_TYPE_COLORS[selectedJob.job_type]?.bg} ${JOB_TYPE_COLORS[selectedJob.job_type]?.text}`}>
                  {selectedJob.job_type}
                </span>
              </div>
              <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-1.5 text-sm text-gray-600">
              <p>📅 {format(parseISO(selectedJob.scheduled_date), "d MMMM yyyy", { locale: fr })}</p>
              {selectedJob.scheduled_time_start && (
                <p>🕐 {selectedJob.scheduled_time_start}{selectedJob.scheduled_time_end ? ` – ${selectedJob.scheduled_time_end}` : ""}</p>
              )}
              <p>📌 {selectedJob.status}</p>
              {selectedJob.notes && <p className="text-gray-500 text-xs mt-2">{selectedJob.notes}</p>}
            </div>
          </div>
        </div>
      )}

      {/* New job modal */}
      {showNewJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Nouveau rendez-vous</h2>
              <button onClick={() => setShowNewJobModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleJobCreate} className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Client *</label>
                <input
                  type="text"
                  placeholder="Rechercher un client..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 mb-1"
                />
                <select
                  value={jobForm.contact_id}
                  onChange={(e) => setJobForm((p) => ({ ...p, contact_id: e.target.value }))}
                  required
                  size={4}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">— Sélectionner —</option>
                  {filteredContacts.slice(0, 50).map((c) => {
                    const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
                    const last = c.last_name && c.last_name?.trim() !== "" ? c.last_name : null;
                    const name = first || last ? [first, last].filter(Boolean).join(" ") : (c.phone ?? "");
                    return <option key={c.id} value={c.id}>{name}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Type</label>
                <select
                  value={jobForm.job_type}
                  onChange={(e) => setJobForm((p) => ({ ...p, job_type: e.target.value as Job["job_type"] }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="ouverture">Ouverture</option>
                  <option value="entretien">Entretien</option>
                  <option value="fermeture">Fermeture</option>
                  <option value="visite">Visite</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
                <input
                  type="date" value={jobForm.scheduled_date} required
                  onChange={(e) => setJobForm((p) => ({ ...p, scheduled_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Heure début</label>
                  <input
                    type="time" value={jobForm.scheduled_time_start}
                    onChange={(e) => setJobForm((p) => ({ ...p, scheduled_time_start: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Heure fin</label>
                  <input
                    type="time" value={jobForm.scheduled_time_end}
                    onChange={(e) => setJobForm((p) => ({ ...p, scheduled_time_end: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                <textarea
                  rows={3} value={jobForm.notes}
                  onChange={(e) => setJobForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNewJobModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
                  Annuler
                </button>
                <button type="submit" disabled={savingJob} className="px-5 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition">
                  {savingJob ? "Création..." : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
