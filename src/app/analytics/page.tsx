"use client";

import { useEffect, useState } from "react";
import { DollarSign, UserPlus, TrendingUp, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────────────────────
interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  stage: string | null;
  season_price: number | null;
  services: string[] | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

type Period = "month" | "3months" | "6months" | "year" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  month:   "Ce mois",
  "3months": "3 derniers mois",
  "6months": "6 derniers mois",
  year:    "Cette année",
  all:     "Tout",
};

const CLOSED_STAGES = ["closé", "planifié", "complété"];

const STAGE_ORDER = ["nouveau", "contacté", "soumission_envoyée", "closé", "planifié", "complété", "perdu"];
const STAGE_COLORS: Record<string, string> = {
  nouveau:          "#3b82f6",
  contacté:         "#eab308",
  soumission_envoyée: "#f97316",
  closé:            "#22c55e",
  planifié:         "#8b5cf6",
  complété:         "#6b7280",
  perdu:            "#ef4444",
};

const SOURCE_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#ec4899", "#06b6d4"];

function fmt(amount: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency", currency: "CAD", minimumFractionDigits: 0,
  }).format(amount);
}

function getPeriodStart(period: Period): Date | null {
  const now = new Date();
  if (period === "all") return null;
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "3months") return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (period === "6months") return new Date(now.getFullYear(), now.getMonth() - 5, 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

const FR_MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// ── Page ──────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("year");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from("contacts")
        .select("id, first_name, last_name, phone, stage, season_price, services, source, created_at, updated_at")
        .order("created_at", { ascending: false });

      const start = getPeriodStart(period);
      if (start) query = query.gte("created_at", start.toISOString());

      const { data } = await query;
      setContacts((data as Contact[]) || []);
      setLoading(false);
    };
    load();
  }, [period]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const closedContacts = contacts.filter((c) => CLOSED_STAGES.includes(c.stage ?? ""));
  const totalRevenue   = closedContacts.reduce((s, c) => s + (c.season_price ?? 0), 0);
  const totalLeads     = contacts.length;
  const convRate       = totalLeads > 0 ? Math.round((closedContacts.length / totalLeads) * 100) : 0;
  const avgRevenue     = closedContacts.length > 0 ? Math.round(totalRevenue / closedContacts.length) : 0;

  // Revenue par mois
  const revenueByMonth: Record<string, number> = {};
  for (const c of closedContacts) {
    const d = new Date(c.updated_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    revenueByMonth[key] = (revenueByMonth[key] ?? 0) + (c.season_price ?? 0);
  }
  const revenueChartData = Object.entries(revenueByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const [yr, mo] = key.split("-");
      return { month: `${FR_MONTHS[parseInt(mo)]} ${yr}`, revenue: value };
    });

  // Leads par semaine
  const leadsByWeek: Record<string, number> = {};
  for (const c of contacts) {
    const d = new Date(c.created_at);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().split("T")[0];
    leadsByWeek[key] = (leadsByWeek[key] ?? 0) + 1;
  }
  const leadsChartData = Object.entries(leadsByWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const d = new Date(key + "T00:00:00");
      const label = d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
      return { week: label, leads: count };
    });

  // Pipeline par stage
  const stageCount: Record<string, number> = {};
  for (const c of contacts) {
    const s = c.stage ?? "nouveau";
    stageCount[s] = (stageCount[s] ?? 0) + 1;
  }
  const pipelineData = STAGE_ORDER
    .filter((s) => (stageCount[s] ?? 0) > 0)
    .map((s) => ({ stage: s, count: stageCount[s] ?? 0, fill: STAGE_COLORS[s] }));

  // Sources
  const sourceCount: Record<string, number> = {};
  for (const c of contacts) {
    const src = c.source ?? "inconnu";
    sourceCount[src] = (sourceCount[src] ?? 0) + 1;
  }
  const sourceData = Object.entries(sourceCount)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  // Dernières conversions
  const lastConversions = contacts
    .filter((c) => c.stage === "closé")
    .slice(0, 10)
    .map((c) => ({
      date: new Date(c.updated_at).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" }),
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || "—",
      service: (c.services ?? []).join(", ") || "—",
      amount: c.season_price ?? 0,
      source: c.source ?? "—",
    }));

  const statCards = [
    {
      label: "Revenue closé",
      display: fmt(totalRevenue),
      icon: <DollarSign size={22} className="text-green-600" />,
      iconBg: "bg-green-50",
    },
    {
      label: "Leads reçus",
      display: String(totalLeads),
      icon: <UserPlus size={22} className="text-blue-600" />,
      iconBg: "bg-blue-50",
    },
    {
      label: "Taux de conversion",
      display: `${convRate}%`,
      icon: <TrendingUp size={22} className="text-purple-600" />,
      iconBg: "bg-purple-50",
    },
    {
      label: "Revenue moyen/client",
      display: avgRevenue > 0 ? fmt(avgRevenue) : "—",
      icon: <BarChart3 size={22} className="text-orange-600" />,
      iconBg: "bg-orange-50",
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20"
        >
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
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

          {/* Revenue par mois */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Revenue par mois</h2>
            {revenueChartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Aucune donnée pour la période sélectionnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revenueChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis tickFormatter={(v) => `${v / 1000}k$`} tick={{ fontSize: 12, fill: "#6b7280" }} width={48} />
                  <Tooltip formatter={(v) => [fmt(Number(v)), "Revenue"]} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Leads par semaine */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Nouveaux leads par semaine</h2>
            {leadsChartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Aucune donnée pour la période sélectionnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={leadsChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} width={32} />
                  <Tooltip formatter={(v) => [Number(v), "Leads"]} />
                  <Area type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} fill="url(#leadGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pipeline funnel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Pipeline — Conversion par étape</h2>
            {pipelineData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Aucune donnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, pipelineData.length * 44)}>
                <BarChart data={pipelineData} layout="vertical" margin={{ top: 0, right: 40, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fill: "#6b7280" }} width={120} />
                  <Tooltip formatter={(v) => [Number(v), "Contacts"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {pipelineData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Sources */}
          {sourceData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
              <h2 className="text-sm font-bold text-gray-800 mb-4">Sources de leads</h2>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="40%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                    labelLine={false}
                  >
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend layout="vertical" align="right" verticalAlign="middle" />
                  <Tooltip formatter={(v) => [Number(v), "Leads"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Dernières conversions */}
          {lastConversions.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-4">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-800">Dernières conversions</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Date", "Client", "Service", "Montant", "Source"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lastConversions.map((c, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{c.date}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{c.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[160px] truncate">{c.service}</td>
                        <td className="px-4 py-3 text-sm font-medium text-green-600 whitespace-nowrap">{c.amount > 0 ? fmt(c.amount) : "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{c.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
