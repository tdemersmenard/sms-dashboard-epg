"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Sparkles, Phone, MessageSquare, Mail } from "lucide-react";
import DashboardStats from "@/components/DashboardStats";
import FermeturesTracker from "@/components/FermeturesTracker";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "@/components/FranchiseProvider";
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
  entretien: { bg: "bg-chip",   text: "text-blue-700" },
  fermeture: { bg: "bg-orange-100", text: "text-orange-700" },
  visite:    { bg: "bg-purple-100", text: "text-purple-700" },
  autre:     { bg: "bg-chip",   text: "text-ink" },
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
  const { franchiseId, franchiseSlug } = useFranchise();
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

  // Load contacts with payments (stats based entirely on payments table)
  const loadClients = useCallback(async () => {
    if (!franchiseId) return;
    const { data: contactsData } = await supabaseBrowser
      .from("contacts")
      .select("id, first_name, last_name, name, phone, address, services, season_price, notes")
      .eq("franchise_id", franchiseId)
      .order("first_name");

    if (!contactsData || contactsData.length === 0) {
      setClients([]);
      setClientsLoading(false);
      return;
    }

    const ids = contactsData.map((c) => c.id);
    const { data: paymentsData } = await supabaseBrowser
      .from("payments")
      .select("contact_id, amount, status")
      .in("contact_id", ids);

    const receivedMap: Record<string, number> = {};
    const totalMap: Record<string, number> = {};
    for (const p of paymentsData ?? []) {
      totalMap[p.contact_id] = (totalMap[p.contact_id] ?? 0) + (p.amount ?? 0);
      if (p.status === "reçu") {
        receivedMap[p.contact_id] = (receivedMap[p.contact_id] ?? 0) + (p.amount ?? 0);
      }
    }

    // Only show clients who have payments or a season_price set
    const clientsWithData = contactsData.filter(c => (totalMap[c.id] ?? 0) > 0 || (c.season_price ?? 0) > 0);

    setClients(
      clientsWithData.map((c) => ({
        id: c.id,
        name: displayName(c),
        address: c.address,
        services: c.services ?? [],
        total: Math.max(totalMap[c.id] ?? 0, c.season_price ?? 0),
        paid: receivedMap[c.id] ?? 0,
        notes: c.notes,
      }))
    );
    setClientsLoading(false);
  }, [franchiseId]);

  // Load dynamic data (jobs + messages)
  useEffect(() => {
    if (!franchiseId) return;
    const load = async () => {
      try {
      const todayStr = format(new Date(), "yyyy-MM-dd");

      const [{ data: jobsRaw }, { data: msgsRaw }] = await Promise.all([
        supabaseBrowser.from("jobs").select("*").eq("franchise_id", franchiseId).gte("scheduled_date", todayStr).neq("status", "annulé").order("scheduled_date").limit(5),
        supabaseBrowser.from("messages").select("*").eq("franchise_id", franchiseId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(5),
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

      } catch (e) {
        console.error("[dashboard] dynamic load error:", e);
      } finally {
        setDynamicLoading(false);
      }
    };
    load();
  }, [franchiseId]);

  useEffect(() => { loadClients(); }, [loadClients]);

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

  const runAudit = async () => {
    setAuditLoading(true);
    setAuditActions(null);
    try {
      const res = await fetch("/api/ai/audit");
      if (res.status === 403) {
        setAuditActions([]);
        return;
      }
      if (!res.ok) throw new Error(`audit failed: ${res.status}`);
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
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl  text-sm font-medium ${
          gmailToast === "connected" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          <Mail size={16} />
          {gmailToast === "connected" ? "Gmail connecté avec succès!" : "Erreur de connexion Gmail"}
        </div>
      )}

      {/* DocuSign OAuth toast */}
      {docuSignToast && (
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl  text-sm font-medium ${
          docuSignToast === "connected" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          {docuSignToast === "connected" ? "DocuSign connecté avec succès!" : "Erreur de connexion DocuSign"}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-ink">Dashboard</h1>
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
              className="flex items-center gap-1.5 text-xs font-medium text-white btn-glow hover:opacity-90 px-3 py-1.5 rounded-lg transition"
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

      {/* Stats */}
      <div className="mb-6">
        <DashboardStats />
      </div>

      {/* Suivi des fermetures (visible en saison seulement) */}
      <FermeturesTracker />

      {/* AI Audit */}
      <div className="bg-sur rounded-xl  border border-line p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-ink">Analyse AI des conversations</h2>
            {auditActions && auditActions.length > 0 && (
              <p className="text-xs text-mut mt-0.5">
                {auditActions.filter((a) => a.priority === "urgent").length} urgentes ·{" "}
                {auditActions.filter((a) => a.priority === "high").length} high priority ·{" "}
                {auditActions.length} total
              </p>
            )}
          </div>
          <button
            onClick={runAudit}
            disabled={auditLoading}
            className="flex items-center gap-2 px-4 py-2 btn-glow text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            <Sparkles size={15} />
            {auditLoading ? "Analyse en cours..." : "Analyser les conversations"}
          </button>
        </div>

        {auditLoading && (
          <div className="flex items-center gap-3 py-6 text-sm text-mut">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
            L&apos;AI analyse vos conversations...
          </div>
        )}

        {auditActions && auditActions.length === 0 && !auditLoading && (
          <p className="text-sm text-mut py-2">Aucune action détectée — toutes les conversations sont à jour 🏊</p>
        )}

        {auditActions && auditActions.length > 0 && (
          <div className="space-y-3">
            {auditActions.map((a, i) => {
              const PRIORITY_BADGE: Record<string, string> = {
                urgent: "bg-red-100 text-red-700",
                high:   "bg-orange-100 text-orange-700",
                medium: "bg-yellow-100 text-yellow-700",
                low:    "bg-chip text-mut",
              };
              const CATEGORY_BADGE: Record<string, { cls: string; label: string }> = {
                appeler:    { cls: "bg-green-100 text-green-700",  label: "Appeler" },
                soumission: { cls: "bg-chip text-blue-700",    label: "Soumission" },
                contrat:    { cls: "bg-purple-100 text-purple-700",label: "Contrat" },
                relance:    { cls: "bg-orange-100 text-orange-700",label: "Relance" },
                paiement:   { cls: "bg-red-100 text-red-700",      label: "Paiement" },
                rdv:        { cls: "bg-teal-100 text-teal-700",    label: "RDV" },
                autre:      { cls: "bg-chip text-mut",    label: "Autre" },
              };
              const cat = CATEGORY_BADGE[a.category] ?? CATEGORY_BADGE.autre;
              return (
                <div key={i} className="bg-page rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-sm font-semibold text-ink truncate">{a.contactName}</span>
                      <span className="text-xs text-mut">{a.phone}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cat.cls}`}>{cat.label}</span>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${PRIORITY_BADGE[a.priority] ?? PRIORITY_BADGE.low}`}>
                      {a.priority}
                    </span>
                  </div>
                  <p className="text-sm text-ink font-medium mb-1">{a.action}</p>
                  <p className="text-xs text-mut mb-3">{a.details}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/${franchiseSlug}/messages${a.contactId ? `?contact=${a.contactId}` : ""}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 btn-glow text-white text-xs font-medium rounded-lg hover:opacity-90 transition"
                    >
                      <MessageSquare size={12} />
                      SMS
                    </button>
                    <a
                      href={`tel:${a.phone}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-line text-ink text-xs font-medium rounded-lg hover:bg-chip transition"
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
      <div className="bg-sur rounded-xl  border border-line overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="text-sm font-bold text-ink">Clients — Saison 2026</h2>
        </div>

        {clientsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <p className="px-5 py-8 text-sm text-mut">
            Aucun client avec un prix de saison enregistré. Ajoutez un prix saison dans la fiche client.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-page">
                <tr>
                  {["Nom", "Adresse", "Services", "Total", "Payé", "Reste", "Notes"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-mut uppercase tracking-wider whitespace-nowrap">
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
                      className="hover:bg-chip transition cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-ink whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-3 text-sm text-mut max-w-[160px] truncate">{c.address || <span className="text-mut">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-ink whitespace-nowrap">{c.services.length > 0 ? c.services.join(", ") : <span className="text-mut">—</span>}</td>
                      <td className="px-4 py-3 text-sm font-medium text-ink whitespace-nowrap">{fmt(c.total)}</td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${c.paid > 0 ? "text-green-600" : "text-mut"}`}>
                        {fmt(c.paid)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${reste > 0 ? "text-red-600" : "text-green-600"}`}>
                        {reste > 0 ? fmt(reste) : "✓ Soldé"}
                      </td>
                      <td className="px-4 py-3 text-xs text-mut max-w-[180px] truncate">{c.notes ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-page">
                  <td className="px-4 py-3 text-sm font-bold text-ink" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-sm font-bold text-ink whitespace-nowrap">{fmt(totalRevenue)}</td>
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
      <div className="bg-sur rounded-xl  border border-line p-5 mt-6">
        <h2 className="text-sm font-bold text-ink mb-4">Prochains rendez-vous</h2>
        {dynamicLoading ? (
          <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        ) : upcomingJobs.length === 0 ? (
          <p className="text-sm text-mut">Aucun rendez-vous à venir</p>
        ) : (
          <div className="space-y-2">
            {upcomingJobs.map((j) => {
              const jc = JOB_TYPE_COLORS[j.job_type] ?? JOB_TYPE_COLORS.autre;
              return (
                <div key={j.id} className="flex items-center gap-3 py-1.5">
                  <Calendar size={14} className="text-mut flex-shrink-0" />
                  <p className="text-sm text-mut w-32 flex-shrink-0">
                    {format(new Date(j.scheduled_date + "T00:00:00"), "d MMM yyyy", { locale: fr })}
                    {j.scheduled_time_start ? ` · ${j.scheduled_time_start}` : ""}
                  </p>
                  <p className="text-sm font-medium text-ink flex-1 min-w-0 truncate">{j.contactName}</p>
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
      <div className="bg-sur rounded-xl  border border-line p-5 mt-4">
        <h2 className="text-sm font-bold text-ink mb-4">Derniers messages reçus</h2>
        {dynamicLoading ? (
          <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        ) : recentMessages.length === 0 ? (
          <p className="text-sm text-mut">Aucun message reçu</p>
        ) : (
          <div className="space-y-1">
            {recentMessages.map((m) => (
              <div
                key={m.id}
                onClick={() => router.push(`/${franchiseSlug}/messages${m.contact_id ? `?contact=${m.contact_id}` : ""}`)}
                className="flex items-center gap-3 py-2 cursor-pointer hover:bg-chip rounded-lg px-2 -mx-2 transition"
              >
                <div className="w-8 h-8 rounded-full bg-chip flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-mut">
                    {m.contactName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{m.contactName}</p>
                  <p className="text-xs text-mut truncate">{m.body}</p>
                </div>
                <span className="text-xs text-mut flex-shrink-0">{formatTime(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
