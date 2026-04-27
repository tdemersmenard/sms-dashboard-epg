"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, TrendingDown, CreditCard, AlertTriangle, UserCheck, Target, Calendar, PiggyBank, Receipt } from "lucide-react";

const PERIODS = [
  { key: "today",     label: "Aujourd'hui" },
  { key: "yesterday", label: "Hier" },
  { key: "7d",        label: "7 jours" },
  { key: "30d",       label: "30 jours" },
  { key: "90d",       label: "90 jours" },
  { key: "year",      label: "Cette année" },
  { key: "all",       label: "Tout" },
] as const;

type PeriodKey = typeof PERIODS[number]["key"];

interface Stats {
  period: string;
  totalRevenue: number;
  totalBilled: number;
  periodRevenue: number;
  prevRevenue: number;
  periodChange: number | null;
  periodDepenses: number;
  periodProfit: number;
  totalOwed: number;
  totalOverdue: number;
  overdueCount: number;
  totalDepenses: number;
  profitNet: number;
  totalClients: number;
  activeClients: number;
  totalLeads: number;
  conversionRate: number;
  lostClients: number;
  revenueByMonth: { month: string; revenue: number; depenses: number }[];
  revenueByService: Record<string, number>;
  upcomingJobsThisWeek: number;
  periodFacture: number;
  periodRecu: number;
  periodARecevoir: number;
}

const fmt = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

export default function DashboardStats() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/stats?period=${period}`)
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  const periodLabel = PERIODS.find(p => p.key === period)?.label || "";

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-700">Statistiques</h2>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                period === p.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
          </div>
        </div>
      ) : stats ? (
        <>
          {/* Row 1: Revenue */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label={`Encaissé — ${periodLabel}`}
              value={fmt(stats.periodRevenue)}
              icon={<DollarSign size={20} />}
              iconColor="text-green-600"
              iconBg="bg-green-50"
              change={stats.periodChange}
            />
            <StatCard
              label={`Facturé — ${periodLabel}`}
              value={fmt(stats.periodFacture)}
              icon={<PiggyBank size={20} />}
              iconColor="text-violet-600"
              iconBg="bg-violet-50"
              subtitle={`Total: ${fmt(stats.totalBilled)}`}
            />
            <StatCard
              label="À recevoir"
              value={fmt(stats.totalOwed)}
              icon={<CreditCard size={20} />}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
            />
            <StatCard
              label="En retard"
              value={fmt(stats.totalOverdue)}
              icon={<AlertTriangle size={20} />}
              iconColor={stats.overdueCount > 0 ? "text-red-600" : "text-gray-400"}
              iconBg={stats.overdueCount > 0 ? "bg-red-50" : "bg-gray-50"}
              subtitle={stats.overdueCount > 0 ? `${stats.overdueCount} paiement${stats.overdueCount > 1 ? "s" : ""}` : "Aucun"}
            />
          </div>

          {/* Row 2: Clients + Operations */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Clients actifs"
              value={String(stats.activeClients)}
              icon={<UserCheck size={20} />}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
              subtitle={`${stats.totalClients} total`}
            />
            <StatCard
              label="Taux conversion"
              value={`${stats.conversionRate}%`}
              icon={<Target size={20} />}
              iconColor="text-indigo-600"
              iconBg="bg-indigo-50"
              subtitle={`${stats.totalLeads} leads`}
            />
            <StatCard
              label={`Dépenses — ${periodLabel}`}
              value={fmt(stats.periodDepenses)}
              icon={<Receipt size={20} />}
              iconColor="text-orange-600"
              iconBg="bg-orange-50"
              subtitle={`Profit: ${fmt(stats.periodProfit)}`}
            />
            <StatCard
              label="Jobs cette semaine"
              value={String(stats.upcomingJobsThisWeek)}
              icon={<Calendar size={20} />}
              iconColor="text-cyan-600"
              iconBg="bg-cyan-50"
            />
          </div>

          {/* Revenue chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenus vs dépenses (6 mois)</h3>
            <RevenueChart data={stats.revenueByMonth} />
          </div>

          {/* Revenue by service */}
          {Object.keys(stats.revenueByService).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Revenus par service</h3>
              <p className="text-xs text-gray-400 mb-3">{periodLabel}</p>
              <div className="space-y-2">
                {Object.entries(stats.revenueByService)
                  .sort(([, a], [, b]) => b - a)
                  .map(([service, amount]) => {
                    const pct = stats.periodRevenue > 0 ? (amount / stats.periodRevenue) * 100 : 0;
                    const colors: Record<string, string> = {
                      entretien: "bg-blue-400",
                      ouverture: "bg-green-400",
                      fermeture: "bg-orange-400",
                      spa: "bg-purple-400",
                      réparation: "bg-red-400",
                    };
                    return (
                      <div key={service}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize text-gray-700">{service}</span>
                          <span className="font-medium text-gray-900">{fmt(amount)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[service] || "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function RevenueChart({ data }: { data: { month: string; revenue: number; depenses: number }[] }) {
  const maxVal = Math.max(...data.map(m => Math.max(m.revenue, m.depenses)), 1);
  return (
    <>
      <div className="flex items-end gap-2" style={{ height: 120 }}>
        {data.map((m, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex gap-0.5 items-end justify-center" style={{ height: 100 }}>
              <div
                className="bg-green-400 rounded-t"
                style={{ width: "40%", height: `${Math.max((m.revenue / maxVal) * 100, 2)}px` }}
                title={`Revenus: ${fmt(m.revenue)}`}
              />
              <div
                className="bg-orange-300 rounded-t"
                style={{ width: "40%", height: `${Math.max((m.depenses / maxVal) * 100, 2)}px` }}
                title={`Dépenses: ${fmt(m.depenses)}`}
              />
            </div>
            <span className="text-[10px] text-gray-500">{m.month}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded inline-block" /> Revenus</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-300 rounded inline-block" /> Dépenses</span>
      </div>
    </>
  );
}

function StatCard({ label, value, icon, iconColor, iconBg, change, subtitle }: {
  label: string; value: string; icon: React.ReactNode;
  iconColor: string; iconBg: string;
  change?: number | null; subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 leading-tight">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} flex-shrink-0 ml-1`}>
          {icon}
        </div>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {change !== undefined && change !== null && (
        <div className={`text-xs mt-1 flex items-center gap-1 ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {change >= 0 ? "+" : ""}{change}% vs période préc.
        </div>
      )}
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}
