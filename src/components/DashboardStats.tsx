"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, CreditCard, AlertTriangle, UserCheck, Target, Calendar, Receipt, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";

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
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="w-2 h-2 rounded-full bg-[var(--le-acc)] animate-pulse" />
          Vue d&apos;ensemble
        </div>
        <div className="flex bg-chip rounded-xl p-1 gap-0.5 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                period === p.key
                  ? "bg-sur text-ink "
                  : "text-mut hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-chip rounded-3xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-chip rounded-2xl" />)}
          </div>
        </div>
      ) : stats ? (
        <>
          {/* ── HERO : Revenu ────────────────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl bg-hero-grad border border-line text-ink">
            {/* halo aqua discret */}
            <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full blur-3xl" style={{ background: "var(--le-glow)" }} />

            <div className="relative px-6 pt-6 sm:px-8 sm:pt-8">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 lbl">
                    <Wallet size={14} />
                    Revenu encaissé · {periodLabel}
                  </div>
                  <div className="mt-2 flex items-end gap-3 flex-wrap">
                    <span className="font-display text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums text-grad">
                      {fmt(stats.periodRevenue)}
                    </span>
                    {stats.periodChange !== null && (
                      <span className={`mb-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        stats.periodChange >= 0
                          ? "bg-chip text-pos ring-1 ring-inset ring-line"
                          : "bg-chip text-neg ring-1 ring-inset ring-line"
                      }`}>
                        {stats.periodChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {stats.periodChange >= 0 ? "+" : ""}{stats.periodChange}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-mut num">
                    {fmt(stats.totalRevenue)} encaissé depuis le début · profit {fmt(stats.periodProfit)}
                  </p>
                </div>

                {/* mini legend */}
                <div className="flex items-center gap-1.5 rounded-full bg-chip px-3 py-1.5 text-xs text-mut ring-1 ring-inset ring-line">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--le-acc)" }} />
                  6 derniers mois
                </div>
              </div>
            </div>

            {/* Area chart */}
            <RevenueArea data={stats.revenueByMonth} />
          </div>

          {/* ── KPI : Argent ─────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Facturé"
              sub={periodLabel}
              value={fmt(stats.periodFacture)}
              foot={`Total facturé ${fmt(stats.totalBilled)}`}
              accent="text-violet-600"
            />
            <KpiCard
              label="À recevoir"
              sub="En attente"
              value={fmt(stats.totalOwed)}
              icon={<CreditCard size={15} />}
              accent="text-acc"
            />
            <KpiCard
              label="En retard"
              sub={stats.overdueCount > 0 ? `${stats.overdueCount} paiement${stats.overdueCount > 1 ? "s" : ""}` : "Aucun"}
              value={fmt(stats.totalOverdue)}
              icon={<AlertTriangle size={15} />}
              accent={stats.overdueCount > 0 ? "text-red-600" : "text-mut"}
              danger={stats.overdueCount > 0}
            />
            <KpiCard
              label="Dépenses"
              sub={periodLabel}
              value={fmt(stats.periodDepenses)}
              icon={<Receipt size={15} />}
              foot={`Profit net ${fmt(stats.periodProfit)}`}
              accent="text-orange-600"
            />
          </div>

          {/* ── KPI : Opérations ─────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Clients actifs"
              sub={`${stats.totalClients} au total`}
              value={String(stats.activeClients)}
              icon={<UserCheck size={15} />}
              accent="text-acc"
            />
            <KpiCard
              label="Taux de conversion"
              sub={`${stats.totalLeads} leads`}
              value={`${stats.conversionRate}%`}
              icon={<Target size={15} />}
              accent="text-acc"
            />
            <KpiCard
              label="Profit"
              sub={periodLabel}
              value={fmt(stats.periodProfit)}
              icon={stats.periodProfit >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              accent={stats.periodProfit >= 0 ? "text-pos" : "text-neg"}
            />
            <KpiCard
              label="Jobs cette semaine"
              sub="7 prochains jours"
              value={String(stats.upcomingJobsThisWeek)}
              icon={<Calendar size={15} />}
              accent="text-cyan-600"
            />
          </div>

          {/* ── Charts row ───────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            {/* Revenus vs dépenses */}
            <div className="lg:col-span-3 bg-sur rounded-2xl border border-line/70 p-5 ">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Revenus vs dépenses</h3>
                <div className="flex items-center gap-4 text-xs text-mut">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--le-acc)] inline-block" /> Revenus</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--le-acc2)] inline-block" /> Dépenses</span>
                </div>
              </div>
              <BarChart data={stats.revenueByMonth} />
            </div>

            {/* Revenus par service */}
            <div className="lg:col-span-2 bg-sur rounded-2xl border border-line/70 p-5 ">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Revenus par service</h3>
                <span className="text-xs text-mut">{periodLabel}</span>
              </div>
              {Object.keys(stats.revenueByService).length > 0 ? (
                <div className="space-y-3.5">
                  {Object.entries(stats.revenueByService)
                    .sort(([, a], [, b]) => b - a)
                    .map(([service, amount]) => {
                      const pct = stats.periodRevenue > 0 ? (amount / stats.periodRevenue) * 100 : 0;
                      const colors: Record<string, string> = {
                        entretien: "bg-blue-500",
                        ouverture: "bg-emerald-500",
                        fermeture: "bg-orange-400",
                        spa: "bg-purple-500",
                        réparation: "bg-red-400",
                      };
                      return (
                        <div key={service}>
                          <div className="flex justify-between items-baseline text-sm mb-1.5">
                            <span className="capitalize text-ink font-medium">{service}</span>
                            <span className="font-semibold text-ink tabular-nums">{fmt(amount)}</span>
                          </div>
                          <div className="h-2 bg-chip rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${colors[service] || "bg-gray-400"}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm text-mut py-8 text-center">Aucun revenu sur cette période</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Smooth area chart (hero) ─────────────────────────────── */
function RevenueArea({ data }: { data: { month: string; revenue: number; depenses: number }[] }) {
  const W = 600, H = 190, padT = 24, padB = 34;
  const maxVal = Math.max(...data.map(m => m.revenue), 1);
  const n = data.length;
  const usableH = H - padT - padB;
  const pts = data.map((m, i) => ({
    x: n > 1 ? (i / (n - 1)) * W : W / 2,
    y: padT + usableH - (m.revenue / maxVal) * usableH,
    m,
  }));

  const smooth = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const line = smooth(pts);
  const area = `${line} L ${W} ${H - padB} L 0 ${H - padB} Z`;
  const last = pts[pts.length - 1];

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 190 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--le-acc)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--le-acc)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#revArea)" />
        <path d={line} fill="none" stroke="var(--le-acc)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {last && (
          <>
            <circle cx={last.x} cy={last.y} r="7" fill="var(--le-acc)" opacity="0.25" />
            <circle cx={last.x} cy={last.y} r="3.5" fill="var(--le-sur)" stroke="var(--le-acc)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {/* month labels */}
      <div className="absolute inset-x-0 bottom-2.5 flex justify-between px-6 sm:px-8 text-[11px] font-medium text-blue-200/50">
        {data.map((m, i) => <span key={i} className="capitalize">{m.month}</span>)}
      </div>
    </div>
  );
}

/* ── Bar chart (revenus vs dépenses) ──────────────────────── */
function BarChart({ data }: { data: { month: string; revenue: number; depenses: number }[] }) {
  const maxVal = Math.max(...data.map(m => Math.max(m.revenue, m.depenses)), 1);
  return (
    <div className="flex items-end gap-3" style={{ height: 150 }}>
      {data.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
          <div className="w-full flex gap-1 items-end justify-center" style={{ height: 120 }}>
            <div
              className="flex-1 max-w-[18px] rounded-t-md bg-[var(--le-acc)] opacity-90 group-hover:opacity-100 transition-all"
              style={{ height: `${Math.max((m.revenue / maxVal) * 120, 3)}px` }}
              title={`Revenus: ${fmt(m.revenue)}`}
            />
            <div
              className="flex-1 max-w-[18px] rounded-t-md bg-[var(--le-acc2)] opacity-80 group-hover:opacity-100 transition-all"
              style={{ height: `${Math.max((m.depenses / maxVal) * 120, 3)}px` }}
              title={`Dépenses: ${fmt(m.depenses)}`}
            />
          </div>
          <span className="text-[11px] font-medium text-mut capitalize">{m.month}</span>
        </div>
      ))}
    </div>
  );
}

/* ── KPI card ─────────────────────────────────────────────── */
function KpiCard({ label, sub, value, icon, foot, accent, danger }: {
  label: string; sub?: string; value: string;
  icon?: React.ReactNode; foot?: string; accent: string; danger?: boolean;
}) {
  return (
    <div className={`bg-sur rounded-2xl border p-4  transition-all hover:shadow-md ${danger ? "border-red-200" : "border-line/70"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-mut">{label}</span>
        {icon && <span className={accent}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold text-ink tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mut">{sub}</div>}
      {foot && <div className="mt-2 pt-2 border-t border-line text-[11px] text-mut tabular-nums">{foot}</div>}
    </div>
  );
}
