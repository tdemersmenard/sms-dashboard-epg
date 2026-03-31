"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, CreditCard, AlertCircle, Users, Calendar, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Job, Message } from "@/lib/types";

// ── Types ───────────────────────────────────────────────────
interface SaisonClient {
  id: string;
  name: string;
  address: string;
  service: string;
  total: number;
  paid: number;
  notes: string | null;
}

type JobWithContact = Job & { contactName: string };
type MsgWithContact = Message & { contactName: string };

// ── Helpers ─────────────────────────────────────────────────
const JOB_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ouverture: { bg: "bg-green-100",  text: "text-green-700" },
  entretien: { bg: "bg-blue-100",   text: "text-blue-700" },
  fermeture: { bg: "bg-orange-100", text: "text-orange-700" },
  visite:    { bg: "bg-purple-100", text: "text-purple-700" },
  autre:     { bg: "bg-gray-100",   text: "text-gray-700" },
};

function displayName(c: { first_name?: string | null; last_name?: string | null; name?: string | null; phone?: string | null }): string {
  const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
  const last = c.last_name && c.last_name?.trim() !== "" ? c.last_name : null;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (c.name && c.name !== "Inconnu") return c.name;
  return c.phone ?? "Inconnu";
}

function fmt(amount: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency", currency: "CAD", minimumFractionDigits: 0,
  }).format(amount);
}

function formatTime(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "hier";
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

// ── Inline number cell ──────────────────────────────────────
function EditableCell({
  value, onSave, className = "",
}: {
  value: number;
  onSave: (v: number) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(String(value)); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed !== value) onSave(parsed);
    else setDraft(String(value));
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number" min="0" step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
        className="w-20 border border-blue-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Cliquer pour modifier"
      className={`cursor-pointer hover:underline decoration-dotted ${className}`}
    >
      {fmt(value)}
    </span>
  );
}

// ── Page ────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [clients, setClients] = useState<SaisonClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [upcomingJobs, setUpcomingJobs] = useState<JobWithContact[]>([]);
  const [recentMessages, setRecentMessages] = useState<MsgWithContact[]>([]);
  const [dynamicLoading, setDynamicLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", address: "", service: "", total: "", paid: "" });

  // Load saison_clients
  const loadClients = async () => {
    const { data } = await supabaseBrowser
      .from("saison_clients")
      .select("*")
      .order("created_at");
    setClients((data ?? []) as SaisonClient[]);
    setClientsLoading(false);
  };

  // Load dynamic data (jobs + messages)
  useEffect(() => {
    const load = async () => {
      const todayStr = format(new Date(), "yyyy-MM-dd");

      const [{ data: jobsRaw }, { data: msgsRaw }] = await Promise.all([
        supabaseBrowser.from("jobs").select("*").gte("scheduled_date", todayStr).neq("status", "annulé").order("scheduled_date").limit(5),
        supabaseBrowser.from("messages").select("*").eq("direction", "inbound").order("created_at", { ascending: false }).limit(5),
      ]);

      if (jobsRaw && jobsRaw.length > 0) {
        const ids = Array.from(new Set(jobsRaw.map((j) => j.contact_id)));
        const { data: cs } = await supabaseBrowser.from("contacts").select("id,first_name,last_name,name,phone").in("id", ids);
        const map = Object.fromEntries((cs ?? []).map((c) => [c.id, displayName(c)]));
        setUpcomingJobs(jobsRaw.map((j) => ({ ...j, contactName: map[j.contact_id] ?? "Client" })) as JobWithContact[]);
      }

      if (msgsRaw && msgsRaw.length > 0) {
        const ids = Array.from(new Set(msgsRaw.map((m) => m.contact_id).filter(Boolean)));
        const { data: cs } = await supabaseBrowser.from("contacts").select("id,first_name,last_name,name,phone").in("id", ids);
        const map = Object.fromEntries((cs ?? []).map((c) => [c.id, displayName(c)]));
        setRecentMessages(msgsRaw.map((m) => ({ ...m, contactName: map[m.contact_id] ?? "Inconnu" })) as MsgWithContact[]);
      }

      setDynamicLoading(false);
    };
    load();
  }, []);

  useEffect(() => { loadClients(); }, []);

  // Update a field on a client row
  const updateClient = async (id: string, field: "paid" | "total" | "notes", value: number | string) => {
    setClients((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
    await supabaseBrowser.from("saison_clients").update({ [field]: value }).eq("id", id);
  };

  // Delete a client row
  const deleteClient = async (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    await supabaseBrowser.from("saison_clients").delete().eq("id", id);
  };

  // Add a new client row
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name.trim()) return;
    setSaving(true);
    const { data } = await supabaseBrowser.from("saison_clients").insert({
      name: newForm.name.trim(),
      address: newForm.address.trim(),
      service: newForm.service.trim(),
      total: parseFloat(newForm.total) || 0,
      paid: parseFloat(newForm.paid) || 0,
    }).select().single();
    if (data) setClients((prev) => [...prev, data as SaisonClient]);
    setShowAddModal(false);
    setNewForm({ name: "", address: "", service: "", total: "", paid: "" });
    setSaving(false);
  };

  // Computed totals
  const totalRevenue = clients.reduce((s, c) => s + c.total, 0);
  const totalPaid    = clients.reduce((s, c) => s + c.paid,  0);
  const totalOwed    = totalRevenue - totalPaid;

  const statCards = [
    { label: "Revenu total",  display: fmt(totalRevenue), icon: <DollarSign size={22} className="text-green-600" />,  iconBg: "bg-green-50"  },
    { label: "Payé à date",   display: fmt(totalPaid),    icon: <CreditCard  size={22} className="text-blue-600" />,   iconBg: "bg-blue-50"   },
    { label: "À recevoir",    display: fmt(totalOwed),    icon: <AlertCircle size={22} className="text-orange-600" />, iconBg: "bg-orange-50" },
    { label: "Clients",       display: String(clients.length), icon: <Users size={22} className="text-purple-600" />,  iconBg: "bg-purple-50" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className={`w-12 h-12 rounded-xl ${s.iconBg} flex items-center justify-center`}>
              {s.icon}
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-3">{s.display}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Clients table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800">Clients — Saison 2025</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a1f3f] text-white text-xs font-medium rounded-lg hover:bg-[#0f2855] transition"
          >
            <Plus size={13} />
            Ajouter
          </button>
        </div>

        {clientsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Nom", "Adresse", "Service", "Total", "Payé", "Reste", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clients.map((c) => {
                  const reste = c.total - c.paid;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition group">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate">{c.address || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{c.service}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <EditableCell
                          value={c.total}
                          onSave={(v) => updateClient(c.id, "total", v)}
                          className="text-gray-900 font-medium"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <EditableCell
                          value={c.paid}
                          onSave={(v) => updateClient(c.id, "paid", v)}
                          className={c.paid > 0 ? "text-green-600 font-medium" : "text-gray-400"}
                        />
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${reste > 0 ? "text-red-600" : "text-green-600"}`}>
                        {reste > 0 ? fmt(reste) : "✓ Soldé"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { if (confirm(`Supprimer ${c.name} ?`)) deleteClient(c.id); }}
                          className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-sm font-bold text-gray-900" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{fmt(totalRevenue)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-green-600 whitespace-nowrap">{fmt(totalPaid)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-red-600 whitespace-nowrap">{fmt(totalOwed)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Upcoming jobs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-6">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Prochains rendez-vous</h2>
        {dynamicLoading ? (
          <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        ) : upcomingJobs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun rendez-vous à venir</p>
        ) : (
          <div className="space-y-2">
            {upcomingJobs.map((j) => {
              const jc = JOB_TYPE_COLORS[j.job_type] ?? JOB_TYPE_COLORS.autre;
              return (
                <div key={j.id} className="flex items-center gap-3 py-1.5">
                  <Calendar size={14} className="text-gray-400 flex-shrink-0" />
                  <p className="text-sm text-gray-500 w-32 flex-shrink-0">
                    {format(new Date(j.scheduled_date + "T00:00:00"), "d MMM yyyy", { locale: fr })}
                    {j.scheduled_time_start ? ` · ${j.scheduled_time_start}` : ""}
                  </p>
                  <p className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">{j.contactName}</p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${jc.bg} ${jc.text}`}>
                    {j.job_type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent messages */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-4">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Derniers messages reçus</h2>
        {dynamicLoading ? (
          <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        ) : recentMessages.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun message reçu</p>
        ) : (
          <div className="space-y-1">
            {recentMessages.map((m) => (
              <div
                key={m.id}
                onClick={() => router.push("/messages")}
                className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition"
              >
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-gray-500">
                    {m.contactName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.contactName}</p>
                  <p className="text-xs text-gray-500 truncate">{m.body}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add client modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Ajouter un client</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nom *</label>
                <input type="text" required value={newForm.name} onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Adresse</label>
                <input type="text" value={newForm.address} onChange={(e) => setNewForm((p) => ({ ...p, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Service</label>
                <input type="text" value={newForm.service} onChange={(e) => setNewForm((p) => ({ ...p, service: e.target.value }))}
                  placeholder="ex: Entretien, Ouverture..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Total ($)</label>
                  <input type="number" min="0" step="0.01" value={newForm.total} onChange={(e) => setNewForm((p) => ({ ...p, total: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Payé ($)</label>
                  <input type="number" min="0" step="0.01" value={newForm.paid} onChange={(e) => setNewForm((p) => ({ ...p, paid: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition">
                  {saving ? "Ajout..." : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
