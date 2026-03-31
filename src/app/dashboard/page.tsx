"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, CreditCard, AlertCircle, Users, Calendar } from "lucide-react";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Job, Message } from "@/lib/types";

// ── Hardcoded client data ───────────────────────────────────
const clientsData = [
  { name: "François Tétreault",   address: "24 des Rossignols, Granby",           service: "Entretien",                       total: 2100, paid: 1050 },
  { name: "Karine Gince",         address: "",                                     service: "Ouverture",                       total: 170,  paid: 0    },
  { name: "Vicky",                address: "26 Robinson, Waterloo",                service: "Ouverture",                       total: 175,  paid: 175  },
  { name: "Rox",                  address: "762 rue Beauport, Granby",             service: "Ouverture + Fermeture",           total: 400,  paid: 0    },
  { name: "Maxime",               address: "",                                     service: "Ouverture + Fermeture",           total: 300,  paid: 300  },
  { name: "Michael Bernard",      address: "497 Bégin, Granby",                   service: "Entretien spa",                   total: 1800, paid: 300  },
  { name: "Mathieu Girard",       address: "",                                     service: "Entretien",                       total: 2000, paid: 0    },
  { name: "Yan",                  address: "",                                     service: "Entretien",                       total: 2700, paid: 0    },
  { name: "Olivier Tétreault",    address: "767 rue Terrebonne, Granby",           service: "Ouverture 2 passages",            total: 300,  paid: 300  },
  { name: "Christian Blais",      address: "146 des Cerisiers, Granby",            service: "Entretien",                       total: 2000, paid: 1000 },
  { name: "Jacqueline Auger",     address: "515 ch Huntington, Bromont",           service: "Ouverture",                       total: 200,  paid: 200  },
  { name: "Samuel Dupont",        address: "38 rue Church, Granby",                service: "Entretien aux 2 sem.",            total: 1200, paid: 600  },
  { name: "Marc-André Lapointe",  address: "677 Gilles-Cadorette, Granby",        service: "Entretien",                       total: 2000, paid: 1000 },
  { name: "Caleb Gaumond",        address: "443 Vimont, Granby",                  service: "Entretien",                       total: 1500, paid: 0    },
  { name: "Julien Larouche",      address: "58 Impasse de l'Île, Roxton Pond",    service: "Entretien",                       total: 1800, paid: 900  },
  { name: "Benoit Jalbert",       address: "56 Saint-Urbain, Granby",             service: "Ouverture 2 passages",            total: 300,  paid: 0    },
  { name: "Jean-François Ostiguy",address: "285 ch de l'Ange-Gardien, St-Paul",  service: "Entretien",                       total: 2000, paid: 0    },
  { name: "Philippe Dufour",      address: "",                                     service: "Ouvert./Fermet. + 2 passages",    total: 650,  paid: 325  },
];

const totalRevenue = clientsData.reduce((sum, c) => sum + c.total, 0);
const totalPaid    = clientsData.reduce((sum, c) => sum + c.paid,  0);
const totalOwed    = totalRevenue - totalPaid;

function fmt(amount: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency", currency: "CAD", minimumFractionDigits: 0,
  }).format(amount);
}

// ── Dynamic data types ──────────────────────────────────────
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

function formatTime(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "hier";
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

type JobWithContact = Job & { contactName: string };
type MsgWithContact = Message & { contactName: string; phone: string };

export default function DashboardPage() {
  const router = useRouter();
  const [upcomingJobs, setUpcomingJobs] = useState<JobWithContact[]>([]);
  const [recentMessages, setRecentMessages] = useState<MsgWithContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");

      const [{ data: jobsRaw }, { data: msgsRaw }] = await Promise.all([
        supabaseBrowser
          .from("jobs")
          .select("*")
          .gte("scheduled_date", todayStr)
          .neq("status", "annulé")
          .order("scheduled_date")
          .limit(5),
        supabaseBrowser
          .from("messages")
          .select("*")
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (jobsRaw && jobsRaw.length > 0) {
        const ids = Array.from(new Set(jobsRaw.map((j) => j.contact_id)));
        const { data: cs } = await supabaseBrowser
          .from("contacts").select("id,first_name,last_name,name,phone").in("id", ids);
        const map = Object.fromEntries((cs ?? []).map((c) => [c.id, displayName(c)]));
        setUpcomingJobs(jobsRaw.map((j) => ({ ...j, contactName: map[j.contact_id] ?? "Client" })) as JobWithContact[]);
      }

      if (msgsRaw && msgsRaw.length > 0) {
        const ids = Array.from(new Set(msgsRaw.map((m) => m.contact_id).filter(Boolean)));
        const { data: cs } = await supabaseBrowser
          .from("contacts").select("id,first_name,last_name,name,phone").in("id", ids);
        const map = Object.fromEntries((cs ?? []).map((c) => [c.id, { name: displayName(c), phone: c.phone ?? "" }]));
        setRecentMessages(
          msgsRaw.map((m) => ({
            ...m,
            contactName: map[m.contact_id]?.name ?? "Inconnu",
            phone: map[m.contact_id]?.phone ?? "",
          })) as MsgWithContact[]
        );
      }

      setLoading(false);
    };
    load();
  }, []);

  const statCards = [
    {
      label: "Revenu total",
      display: fmt(totalRevenue),
      icon: <DollarSign size={22} className="text-green-600" />,
      iconBg: "bg-green-50",
    },
    {
      label: "Payé à date",
      display: fmt(totalPaid),
      icon: <CreditCard size={22} className="text-blue-600" />,
      iconBg: "bg-blue-50",
    },
    {
      label: "À recevoir",
      display: fmt(totalOwed),
      icon: <AlertCircle size={22} className="text-orange-600" />,
      iconBg: "bg-orange-50",
    },
    {
      label: "Clients",
      display: String(clientsData.length),
      icon: <Users size={22} className="text-purple-600" />,
      iconBg: "bg-purple-50",
    },
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
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800">Clients — Saison 2025</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Nom", "Adresse", "Service", "Total", "Payé", "Reste"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clientsData.map((c, i) => {
                const reste = c.total - c.paid;
                return (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.address || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{c.service}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">{fmt(c.total)}</td>
                    <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${c.paid > 0 ? "text-green-600" : "text-gray-400"}`}>
                      {c.paid > 0 ? fmt(c.paid) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${reste > 0 ? "text-red-600" : "text-green-600"}`}>
                      {reste > 0 ? fmt(reste) : "✓"}
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
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Upcoming jobs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-6">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Prochains rendez-vous</h2>
        {loading ? (
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
        {loading ? (
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
