"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, CalendarPlus, ChevronDown } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Contact, Job, Document, Payment, Message } from "@/lib/types";

const STAGES = [
  "nouveau", "contacté", "soumission envoyée", "closé",
  "planifié", "complété", "perdu",
] as const;

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  "nouveau":            { bg: "bg-blue-100",   text: "text-blue-700" },
  "contacté":           { bg: "bg-yellow-100", text: "text-yellow-700" },
  "soumission envoyée": { bg: "bg-orange-100", text: "text-orange-700" },
  "closé":              { bg: "bg-green-100",  text: "text-green-700" },
  "planifié":           { bg: "bg-purple-100", text: "text-purple-700" },
  "complété":           { bg: "bg-gray-200",   text: "text-gray-700" },
  "perdu":              { bg: "bg-red-100",    text: "text-red-700" },
};

const JOB_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planifié:  { bg: "bg-blue-100",   text: "text-blue-700" },
  confirmé:  { bg: "bg-green-100",  text: "text-green-700" },
  en_cours:  { bg: "bg-yellow-100", text: "text-yellow-700" },
  complété:  { bg: "bg-gray-200",   text: "text-gray-700" },
  annulé:    { bg: "bg-red-100",    text: "text-red-700" },
};

const DOC_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  brouillon: { bg: "bg-gray-100",   text: "text-gray-600" },
  envoyé:    { bg: "bg-blue-100",   text: "text-blue-700" },
  signé:     { bg: "bg-green-100",  text: "text-green-700" },
  payé:      { bg: "bg-purple-100", text: "text-purple-700" },
};

const PAY_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  en_attente: { bg: "bg-yellow-100", text: "text-yellow-700" },
  reçu:       { bg: "bg-green-100",  text: "text-green-700" },
  en_retard:  { bg: "bg-red-100",    text: "text-red-700" },
};

function displayName(c: Contact): string {
  const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
  const last = c.last_name && c.last_name.trim() !== "" ? c.last_name : null;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (c.name && c.name !== "Inconnu") return c.name;
  return c.phone ?? "Inconnu";
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
}

function formatMsgTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

// Inline editable field
function InlineField({
  label, value, type = "text", onSave,
}: {
  label: string;
  value: string;
  type?: string;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      {editing ? (
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className="w-full border border-blue-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          className="text-sm text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 min-h-[28px] flex items-center"
        >
          {draft || <span className="text-gray-300 italic">—</span>}
        </p>
      )}
    </div>
  );
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;

  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [jobForm, setJobForm] = useState({
    job_type: "ouverture" as Job["job_type"],
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_time_start: "08:00",
    scheduled_time_end: "10:00",
    notes: "",
  });

  const load = useCallback(async () => {
    const [{ data: c }, { data: m }, { data: j }, { data: d }, { data: p }] = await Promise.all([
      supabaseBrowser.from("contacts").select("*").eq("id", id).single(),
      fetch(`/api/messages?contactId=${id}`).then((r) => r.json()).catch(() => []),
      supabaseBrowser.from("jobs").select("*").eq("contact_id", id).order("scheduled_date"),
      supabaseBrowser.from("documents").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
      supabaseBrowser.from("payments").select("*").eq("contact_id", id).order("due_date"),
    ]);
    if (c) setContact(c as Contact);
    setMessages(Array.isArray(m) ? (m as Message[]).slice(-5) : []);
    setJobs((j ?? []) as Job[]);
    setDocuments((d ?? []) as Document[]);
    setPayments((p ?? []) as Payment[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const save = async (fields: Partial<Contact>) => {
    const { data } = await supabaseBrowser
      .from("contacts").update(fields).eq("id", id).select().single();
    if (data) setContact(data as Contact);
  };

  const handleStageChange = async (stage: string) => {
    setShowStageDropdown(false);
    await save({ stage });
  };

  const handleJobCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingJob(true);
    const { data } = await supabaseBrowser
      .from("jobs")
      .insert({ contact_id: id, status: "planifié", ...jobForm })
      .select()
      .single();
    if (data) setJobs((prev) => [...prev, data as Job]);
    setShowJobModal(false);
    setSavingJob(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!contact) {
    return <div className="p-8 text-gray-500">Contact introuvable.</div>;
  }

  const stage = contact.stage ?? "nouveau";
  const sc = STAGE_COLORS[stage];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
          <h1 className="text-xl font-bold text-gray-900 truncate">{displayName(contact)}</h1>
          {/* Stage dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStageDropdown((v) => !v)}
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${sc?.bg ?? "bg-gray-100"} ${sc?.text ?? "text-gray-600"}`}
            >
              {stage}
              <ChevronDown size={12} />
            </button>
            {showStageDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px] py-1">
                {STAGES.map((s) => {
                  const c2 = STAGE_COLORS[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleStageChange(s)}
                      className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-gray-50 flex items-center gap-2`}
                    >
                      <span className={`w-2 h-2 rounded-full ${c2?.bg ?? "bg-gray-200"}`} />
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => router.push(`/messages`)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <MessageSquare size={15} />
            SMS
          </button>
          <button
            onClick={() => setShowJobModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0a1f3f] text-white rounded-lg text-sm font-medium hover:bg-[#0f2855] transition"
          >
            <CalendarPlus size={15} />
            Créer RDV
          </button>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* LEFT */}
        <div className="lg:col-span-3 space-y-4">
          {/* Informations */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Informations</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InlineField label="Prénom" value={contact.first_name ?? ""} onSave={(v) => save({ first_name: v })} />
              <InlineField label="Nom" value={contact.last_name ?? ""} onSave={(v) => save({ last_name: v })} />
              <InlineField label="Téléphone" value={contact.phone ?? ""} type="tel" onSave={(v) => save({ phone: v })} />
              <InlineField label="Email" value={contact.email ?? ""} type="email" onSave={(v) => save({ email: v })} />
              <div className="col-span-2">
                <InlineField label="Adresse" value={contact.address ?? ""} onSave={(v) => save({ address: v })} />
              </div>
              <InlineField label="Ville" value={contact.city ?? ""} onSave={(v) => save({ city: v })} />
              <InlineField label="Code postal" value={contact.postal_code ?? ""} onSave={(v) => save({ postal_code: v })} />
            </div>
          </div>

          {/* Piscine */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Piscine</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Type</p>
                <select
                  value={contact.pool_type ?? ""}
                  onChange={(e) => save({ pool_type: (e.target.value as "hors-terre" | "creusée") || null })}
                  className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">—</option>
                  <option value="hors-terre">Hors-terre</option>
                  <option value="creusée">Creusée</option>
                </select>
              </div>
              <InlineField label="Dimensions" value={contact.pool_dimensions ?? ""} onSave={(v) => save({ pool_dimensions: v })} />
              <InlineField label="Système" value={contact.pool_system ?? ""} onSave={(v) => save({ pool_system: v })} />
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Spa</p>
                <button
                  onClick={() => save({ has_spa: !contact.has_spa })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${contact.has_spa ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${contact.has_spa ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Services & Prix */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Services & Prix</h2>
            <div className="flex gap-4 mb-4">
              {(["ouverture", "entretien", "fermeture"] as const).map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(contact.services ?? []).includes(s)}
                    onChange={() => {
                      const curr = contact.services ?? [];
                      save({ services: curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s] });
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">{s}</span>
                </label>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">Prix saison ($)</p>
              <input
                type="number" min="0" step="0.01"
                defaultValue={contact.season_price ?? ""}
                onBlur={(e) => save({ season_price: e.target.value ? parseFloat(e.target.value) : null })}
                className="border border-gray-200 rounded-md px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Notes</h2>
            <textarea
              defaultValue={contact.notes ?? ""}
              onBlur={(e) => save({ notes: e.target.value || null })}
              rows={4}
              placeholder="Notes internes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-2 space-y-4">
          {/* Messages récents */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Messages récents</h2>
            {messages.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun message</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex flex-col ${m.direction === "outbound" ? "items-end" : "items-start"}`}>
                    <div className={`px-3 py-1.5 rounded-lg text-xs max-w-[85%] ${m.direction === "outbound" ? "bg-[#0a1f3f] text-white" : "bg-gray-100 text-gray-800"}`}>
                      {m.body}
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5">{formatMsgTime(m.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => router.push("/messages")}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Voir la conversation →
            </button>
          </div>

          {/* Rendez-vous */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-800">Rendez-vous</h2>
              <button onClick={() => setShowJobModal(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Nouveau</button>
            </div>
            {jobs.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun rendez-vous</p>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => {
                  const jsc = JOB_STATUS_COLORS[j.status];
                  return (
                    <div key={j.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800">{formatDate(j.scheduled_date)}</p>
                        <p className="text-xs text-gray-500">{j.job_type}{j.scheduled_time_start ? ` · ${j.scheduled_time_start}` : ""}</p>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${jsc?.bg ?? "bg-gray-100"} ${jsc?.text ?? "text-gray-600"}`}>
                        {j.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Documents</h2>
            {documents.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun document</p>
            ) : (
              <div className="space-y-2">
                {documents.map((d) => {
                  const dsc = DOC_STATUS_COLORS[d.status];
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800">{d.doc_type} #{d.doc_number}</p>
                        {d.amount != null && (
                          <p className="text-xs text-gray-500">
                            {d.amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${dsc?.bg ?? "bg-gray-100"} ${dsc?.text ?? "text-gray-600"}`}>
                        {d.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Paiements */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Paiements</h2>
            {payments.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun paiement</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => {
                  const psc = PAY_STATUS_COLORS[p.status];
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800">
                          {p.amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
                        </p>
                        {p.due_date && <p className="text-xs text-gray-500">Dû le {formatDate(p.due_date)}</p>}
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${psc?.bg ?? "bg-gray-100"} ${psc?.text ?? "text-gray-600"}`}>
                        {p.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {showStageDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowStageDropdown(false)} />
      )}

      {/* Job modal */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Nouveau rendez-vous</h2>
              <button onClick={() => setShowJobModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleJobCreate} className="px-5 py-4 space-y-3">
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
                <button type="button" onClick={() => setShowJobModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
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
