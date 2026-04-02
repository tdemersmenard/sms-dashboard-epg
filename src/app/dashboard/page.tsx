"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DollarSign, CreditCard, AlertCircle, Users, Calendar, Sparkles, Phone, MessageSquare, Mail } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Job, Message } from "@/lib/types";
import type { AuditAction } from "@/lib/ai-audit";

// ── Types ───────────────────────────────────────────────────
interface ClientRow {
  id: string;
  name: string;
  address: string | null;
  services: string[];
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

// ── Page ────────────────────────────────────────────────────
// Separate component for search-params-based toast (requires Suspense)
function OAuthToastHandler({
  onGmailToast,
  onGmailConnected,
  onDocuSignToast,
  onDocuSignConnected,
}: {
  onGmailToast: (t: "connected" | "error") => void;
  onGmailConnected: () => void;
  onDocuSignToast: (t: "connected" | "error") => void;
  onDocuSignConnected: () => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const gmail = searchParams.get("gmail");
    if (gmail === "connected") { onGmailToast("connected"); onGmailConnected(); }
    else if (gmail === "error") { onGmailToast("error"); }

    const ds = searchParams.get("docusign");
    if (ds === "connected") { onDocuSignToast("connected"); onDocuSignConnected(); }
    else if (ds === "error") { onDocuSignToast("error"); }
  }, [searchParams, onGmailToast, onGmailConnected, onDocuSignToast, onDocuSignConnected]);
  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [upcomingJobs, setUpcomingJobs] = useState<JobWithContact[]>([]);
  const [recentMessages, setRecentMessages] = useState<MsgWithContact[]>([]);
  const [dynamicLoading, setDynamicLoading] = useState(true);
  const [auditActions, setAuditActions] = useState<AuditAction[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<"connected" | "disconnected" | "loading">("loading");
  const [gmailToast, setGmailToast] = useState<"connected" | "error" | null>(null);
  const [docuSignStatus, setDocuSignStatus] = useState<"connected" | "disconnected" | "loading">("loading");
  const [docuSignToast, setDocuSignToast] = useState<"connected" | "error" | null>(null);
  const [command, setCommand] = useState("");
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandResult, setCommandResult] = useState<{ understood: boolean; summary: string; results?: string[] } | null>(null);
  const commandResultTimer = useState<ReturnType<typeof setTimeout> | null>(null);

  // Load contacts with season_price > 0 + their received payments
  const loadClients = async () => {
    const { data: contactsData } = await supabaseBrowser
      .from("contacts")
      .select("id, first_name, last_name, name, phone, address, services, season_price, notes")
      .gt("season_price", 0)
      .order("first_name");

    if (!contactsData || contactsData.length === 0) {
      setClients([]);
      setClientsLoading(false);
      return;
    }

    const ids = contactsData.map((c) => c.id);
    const { data: paymentsData } = await supabaseBrowser
      .from("payments")
      .select("contact_id, amount")
      .eq("status", "reçu")
      .in("contact_id", ids);

    const paidMap: Record<string, number> = {};
    for (const p of paymentsData ?? []) {
      paidMap[p.contact_id] = (paidMap[p.contact_id] ?? 0) + (p.amount ?? 0);
    }

    setClients(
      contactsData.map((c) => ({
        id: c.id,
        name: displayName(c),
        address: c.address,
        services: c.services ?? [],
        total: c.season_price ?? 0,
        paid: paidMap[c.id] ?? 0,
        notes: c.notes,
      }))
    );
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

  useEffect(() => { loadClients(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check Gmail connection status
  const checkGmail = useCallback(async () => {
    try {
      const res = await fetch("/api/email/check-payments");
      const data = await res.json();
      setGmailStatus(data.reason === "Gmail not connected" || data.checked === false ? "disconnected" : "connected");
    } catch {
      setGmailStatus("disconnected");
    }
  }, []);

  useEffect(() => { checkGmail(); }, [checkGmail]);

  const checkDocuSign = useCallback(async () => {
    try {
      const res = await fetch("/api/docusign/status");
      const data = await res.json();
      setDocuSignStatus(data.connected ? "connected" : "disconnected");
    } catch {
      setDocuSignStatus("disconnected");
    }
  }, []);

  useEffect(() => { checkDocuSign(); }, [checkDocuSign]);

  const runCommand = async () => {
    if (!command.trim() || commandLoading) return;
    setCommandLoading(true);
    setCommandResult(null);
    if (commandResultTimer[0]) clearTimeout(commandResultTimer[0]);
    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      setCommandResult({ understood: data.understood, summary: data.summary, results: data.results });
      const timer = setTimeout(() => setCommandResult(null), 10000);
      commandResultTimer[1](timer);
    } catch {
      setCommandResult({ understood: false, summary: "Erreur de connexion. Réessaie." });
    }
    setCommandLoading(false);
  };

  const runAudit = async () => {
    setAuditLoading(true);
    setAuditActions(null);
    try {
      const res = await fetch("/api/ai/audit");
      const data = await res.json();
      setAuditActions(data.actions ?? []);
    } catch {
      setAuditActions([]);
    }
    setAuditLoading(false);
  };

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
      {/* OAuth search-params handler (needs Suspense) */}
      <Suspense fallback={null}>
        <OAuthToastHandler
          onGmailToast={(t) => { setGmailToast(t); setTimeout(() => setGmailToast(null), 4000); }}
          onGmailConnected={() => setGmailStatus("connected")}
          onDocuSignToast={(t) => { setDocuSignToast(t); setTimeout(() => setDocuSignToast(null), 4000); }}
          onDocuSignConnected={() => setDocuSignStatus("connected")}
        />
      </Suspense>

      {/* Gmail OAuth toast */}
      {gmailToast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          gmailToast === "connected" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          <Mail size={16} />
          {gmailToast === "connected" ? "Gmail connecté avec succès!" : "Erreur de connexion Gmail"}
        </div>
      )}

      {/* DocuSign OAuth toast */}
      {docuSignToast && (
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          docuSignToast === "connected" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          {docuSignToast === "connected" ? "DocuSign connecté avec succès!" : "Erreur de connexion DocuSign"}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          {/* Gmail connection button */}
          {gmailStatus !== "loading" && (gmailStatus === "connected" ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
              <Mail size={13} />
              Gmail ✓
            </div>
          ) : (
            <a
              href="/api/auth/google"
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#0a1f3f] hover:bg-[#0f2855] px-3 py-1.5 rounded-lg transition"
            >
              <Mail size={13} />
              Connecter Gmail
            </a>
          ))}
          {/* DocuSign connection button */}
          {docuSignStatus !== "loading" && (docuSignStatus === "connected" ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg">
              DocuSign ✓
            </div>
          ) : (
            <a
              href="/api/auth/docusign"
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg transition"
            >
              Connecter DocuSign
            </a>
          ))}
        </div>
      </div>

      {/* Command field */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <p className="text-sm font-medium text-gray-500 mb-2">Commandes CHLORE</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => { setCommand(e.target.value); setCommandResult(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") runCommand(); }}
            placeholder="Ex: Relance Caleb demain pour le paiement, Envoie la facture à Marc-André..."
            className="flex-1 bg-gray-50 rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f]"
          />
          <button
            onClick={runCommand}
            disabled={commandLoading || !command.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition flex-shrink-0"
          >
            {commandLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Exécuter
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Exemples: &apos;Relance Caleb demain pour le paiement&apos; • &apos;Envoie la facture de 180$ à Karine&apos; • &apos;Rappelle Philippe vendredi matin&apos;
        </p>
        {commandResult && (
          <div className={`mt-3 rounded-lg p-3 ${commandResult.understood ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"}`}>
            <p className={`text-sm font-medium ${commandResult.understood ? "text-green-800" : "text-orange-800"}`}>
              {commandResult.summary}
            </p>
            {commandResult.results && commandResult.results.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {commandResult.results.map((r, i) => (
                  <li key={i} className="text-xs text-green-700">• {r}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

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

      {/* AI Audit */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Analyse AI des conversations</h2>
            {auditActions && auditActions.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {auditActions.filter((a) => a.priority === "urgent").length} urgentes ·{" "}
                {auditActions.filter((a) => a.priority === "high").length} high priority ·{" "}
                {auditActions.length} total
              </p>
            )}
          </div>
          <button
            onClick={runAudit}
            disabled={auditLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition"
          >
            <Sparkles size={15} />
            {auditLoading ? "Analyse en cours..." : "Analyser les conversations"}
          </button>
        </div>

        {auditLoading && (
          <div className="flex items-center gap-3 py-6 text-sm text-gray-500">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
            L&apos;AI analyse vos conversations...
          </div>
        )}

        {auditActions && auditActions.length === 0 && !auditLoading && (
          <p className="text-sm text-gray-400 py-2">Aucune action détectée — toutes les conversations sont à jour 🏊</p>
        )}

        {auditActions && auditActions.length > 0 && (
          <div className="space-y-3">
            {auditActions.map((a, i) => {
              const PRIORITY_BADGE: Record<string, string> = {
                urgent: "bg-red-100 text-red-700",
                high:   "bg-orange-100 text-orange-700",
                medium: "bg-yellow-100 text-yellow-700",
                low:    "bg-gray-100 text-gray-500",
              };
              const CATEGORY_BADGE: Record<string, { cls: string; label: string }> = {
                appeler:    { cls: "bg-green-100 text-green-700",  label: "Appeler" },
                soumission: { cls: "bg-blue-100 text-blue-700",    label: "Soumission" },
                contrat:    { cls: "bg-purple-100 text-purple-700",label: "Contrat" },
                relance:    { cls: "bg-orange-100 text-orange-700",label: "Relance" },
                paiement:   { cls: "bg-red-100 text-red-700",      label: "Paiement" },
                rdv:        { cls: "bg-teal-100 text-teal-700",    label: "RDV" },
                autre:      { cls: "bg-gray-100 text-gray-600",    label: "Autre" },
              };
              const cat = CATEGORY_BADGE[a.category] ?? CATEGORY_BADGE.autre;
              return (
                <div key={i} className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">{a.contactName}</span>
                      <span className="text-xs text-gray-400">{a.phone}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cat.cls}`}>{cat.label}</span>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${PRIORITY_BADGE[a.priority] ?? PRIORITY_BADGE.low}`}>
                      {a.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 font-medium mb-1">{a.action}</p>
                  <p className="text-xs text-gray-500 mb-3">{a.details}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push("/messages")}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a1f3f] text-white text-xs font-medium rounded-lg hover:bg-[#0f2855] transition"
                    >
                      <MessageSquare size={12} />
                      SMS
                    </button>
                    <a
                      href={`tel:${a.phone}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition"
                    >
                      <Phone size={12} />
                      Appeler
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clients table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800">Clients — Saison 2026</h2>
        </div>

        {clientsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400">
            Aucun client avec un prix de saison enregistré. Ajoutez un prix saison dans la fiche client.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Nom", "Adresse", "Services", "Total", "Payé", "Reste", "Notes"].map((h) => (
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
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/clients/${c.id}`)}
                      className="hover:bg-gray-50 transition cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[160px] truncate">{c.address || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{c.services.length > 0 ? c.services.join(", ") : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{fmt(c.total)}</td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${c.paid > 0 ? "text-green-600" : "text-gray-400"}`}>
                        {fmt(c.paid)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${reste > 0 ? "text-red-600" : "text-green-600"}`}>
                        {reste > 0 ? fmt(reste) : "✓ Soldé"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-[180px] truncate">{c.notes ?? "—"}</td>
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
    </div>
  );
}
