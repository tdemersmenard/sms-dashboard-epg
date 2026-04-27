"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, TrendingDown, CreditCard, AlertTriangle, UserCheck, Target, Calendar, PiggyBank, Receipt } from "lucide-react";

interface Stats {
  totalRevenue: number;
  monthRevenue: number;
  lastMonthRevenue: number;
  monthRevenueChange: number | null;
  totalOwed: number;
  totalOverdue: number;
  overdueCount: number;
  totalDepenses: number;
  monthDepenses: number;
  profitNet: number;
  monthProfit: number;
  totalClients: number;
  activeClients: number;
  totalLeads: number;
  conversionRate: number;
  lostClients: number;
  revenueByMonth: { month: string; revenue: number; depenses: number }[];
  revenueByService: Record<string, number>;
  upcomingJobsThisWeek: number;
}

const fmt = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

export default function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
      </div>
    </div>
  );

  if (!stats) return null;

  const maxRevenue = Math.max(...stats.revenueByMonth.map(m => Math.max(m.revenue, m.depenses)), 1);

  return (
    <div className="space-y-6">
      {/* Row 1: Revenue cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Revenu ce mois"
          value={fmt(stats.monthRevenue)}
          icon={<DollarSign size={20} />}
          iconColor="text-green-600"
          iconBg="bg-green-50"
          change={stats.monthRevenueChange}
        />
        <StatCard
          label="Profit net total"
          value={fmt(stats.profitNet)}
          icon={<PiggyBank size={20} />}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          subtitle={`Ce mois: ${fmt(stats.monthProfit)}`}
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
          label="Dépenses totales"
          value={fmt(stats.totalDepenses)}
          icon={<Receipt size={20} />}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          subtitle={`Ce mois: ${fmt(stats.monthDepenses)}`}
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
        <div className="flex items-end gap-2 h-40">
          {stats.revenueByMonth.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-0.5 items-end justify-center" style={{ height: 120 }}>
                <div
                  className="bg-green-400 rounded-t"
                  style={{ width: "40%", height: `${Math.max((m.revenue / maxRevenue) * 120, 2)}px` }}
                  title={`Revenus: ${fmt(m.revenue)}`}
                />
                <div
                  className="bg-orange-300 rounded-t"
                  style={{ width: "40%", height: `${Math.max((m.depenses / maxRevenue) * 120, 2)}px` }}
                  title={`Dépenses: ${fmt(m.depenses)}`}
                />
              </div>
              <span className="text-[10px] text-gray-500">{m.month}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded inline-block" /> Revenus</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-300 rounded inline-block" /> Dépenses</span>
        </div>
      </div>

      {/* Revenue by service */}
      {Object.keys(stats.revenueByService).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenus par service</h3>
          <div className="space-y-2">
            {Object.entries(stats.revenueByService)
              .sort(([, a], [, b]) => b - a)
              .map(([service, amount]) => {
                const pct = stats.totalRevenue > 0 ? (amount / stats.totalRevenue) * 100 : 0;
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
    </div>
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
        <span className="text-xs text-gray-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {change !== undefined && change !== null && (
        <div className={`text-xs mt-1 flex items-center gap-1 ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {change >= 0 ? "+" : ""}{change}% vs mois dernier
        </div>
      )}
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}
