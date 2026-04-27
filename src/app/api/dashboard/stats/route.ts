export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Normalise n'importe quel format de date en YYYY-MM-DD
function toDate(val: string | null | undefined): string | null {
  if (!val) return null;
  return val.slice(0, 10);
}

function getPeriodStart(period: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (period) {
    case "today":     return `${y}-${pad(m + 1)}-${pad(d)}`;
    case "yesterday": return toDate(new Date(now.getTime() - 1 * 86400000).toISOString())!;
    case "7d":        return toDate(new Date(now.getTime() - 7  * 86400000).toISOString())!;
    case "30d":       return toDate(new Date(now.getTime() - 30 * 86400000).toISOString())!;
    case "90d":       return toDate(new Date(now.getTime() - 90 * 86400000).toISOString())!;
    case "year":      return `${y}-01-01`;
    default:          return "2000-01-01"; // all
  }
}

function getPeriodEnd(period: string, now: Date): string | null {
  if (period === "yesterday") {
    return toDate(now.toISOString())!; // < today
  }
  return null; // pas de borne haute pour les autres périodes
}

function getPrevPeriodStart(period: string, now: Date): string {
  switch (period) {
    case "today":     return toDate(new Date(now.getTime() - 1  * 86400000).toISOString())!;
    case "yesterday": return toDate(new Date(now.getTime() - 2  * 86400000).toISOString())!;
    case "7d":        return toDate(new Date(now.getTime() - 14 * 86400000).toISOString())!;
    case "30d":       return toDate(new Date(now.getTime() - 60 * 86400000).toISOString())!;
    case "90d":       return toDate(new Date(now.getTime() - 180 * 86400000).toISOString())!;
    case "year":      return `${now.getFullYear() - 1}-01-01`;
    default:          return "2000-01-01";
  }
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "30d";
  const now = new Date();
  const todayStr = toDate(now.toISOString())!;
  const periodStart = getPeriodStart(period, now);
  const periodEnd   = getPeriodEnd(period, now);
  const prevStart   = getPrevPeriodStart(period, now);

  // Tous les paiements
  const { data: allPayments } = await supabaseAdmin
    .from("payments")
    .select("amount, status, received_date, due_date, created_at");

  // Pour les paiements reçus : utilise received_date si dispo, sinon created_at comme fallback
  const received = (allPayments || [])
    .filter(p => p.status === "reçu")
    .map(p => ({
      ...p,
      _date: toDate(p.received_date) ?? toDate(p.created_at) ?? "2000-01-01",
    }));

  // Revenu total (all-time, cash reçu)
  const totalRevenue = received.reduce((s, p) => s + (p.amount || 0), 0);

  // Total facturé (en_attente + reçu) — ce que l'ancien dashboard montrait comme "Revenu total"
  const totalBilled = (allPayments || [])
    .reduce((s, p) => s + (p.amount || 0), 0);

  // Revenu période sélectionnée
  const periodRevenue = received
    .filter(p => p._date >= periodStart && (!periodEnd || p._date < periodEnd))
    .reduce((s, p) => s + (p.amount || 0), 0);

  // Revenu période précédente
  const prevRevenue = received
    .filter(p => p._date >= prevStart && p._date < periodStart)
    .reduce((s, p) => s + (p.amount || 0), 0);

  const periodChange = prevRevenue > 0
    ? Math.round(((periodRevenue - prevRevenue) / prevRevenue) * 100)
    : null;

  // À recevoir & en retard (all-time)
  const totalOwed = (allPayments || [])
    .filter(p => p.status === "en_attente")
    .reduce((s, p) => s + (p.amount || 0), 0);

  const overduePayments = (allPayments || [])
    .filter(p => p.status === "en_attente" && p.due_date && toDate(p.due_date)! < todayStr);

  const totalOverdue = overduePayments.reduce((s, p) => s + (p.amount || 0), 0);

  // Dépenses
  const { data: depenses } = await supabaseAdmin
    .from("depenses")
    .select("montant, date, categorie");

  const totalDepenses = (depenses || []).reduce((s, d) => s + (d.montant || 0), 0);

  const periodDepenses = (depenses || [])
    .filter(d => {
      const dt = toDate(d.date);
      if (!dt) return false;
      return dt >= periodStart && (!periodEnd || dt < periodEnd);
    })
    .reduce((s, d) => s + (d.montant || 0), 0);

  const periodProfit = periodRevenue - periodDepenses;

  // Contacts stats
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, stage, phone")
    .neq("phone", "+14509942215");

  const totalClients   = (contacts || []).filter(c => ["closé", "planifié", "complété"].includes(c.stage || "")).length;
  const activeClients  = (contacts || []).filter(c => ["closé", "planifié"].includes(c.stage || "")).length;
  const totalLeads     = (contacts || []).length;
  const conversionRate = totalLeads > 0 ? Math.round((totalClients / totalLeads) * 100) : 0;
  const lostClients    = (contacts || []).filter(c => c.stage === "perdu").length;

  // Graphique 6 derniers mois
  const currentMonth = now.getMonth();
  const currentYear  = now.getFullYear();
  const revenueByMonth: { month: string; revenue: number; depenses: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const mEnd   = toDate(new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString())!;
    const label  = d.toLocaleDateString("fr-CA", { month: "short" });

    const rev = received
      .filter(p => p._date >= mStart && p._date < mEnd)
      .reduce((s, p) => s + (p.amount || 0), 0);

    const dep = (depenses || [])
      .filter(dd => { const dt = toDate(dd.date); return dt ? dt >= mStart && dt < mEnd : false; })
      .reduce((s, dd) => s + (dd.montant || 0), 0);

    revenueByMonth.push({ month: label, revenue: rev, depenses: dep });
  }

  // Revenus par service (période sélectionnée)
  const { data: paymentsWithContacts } = await supabaseAdmin
    .from("payments")
    .select("amount, status, received_date, created_at, contact_id, contacts(services)")
    .eq("status", "reçu");

  const revenueByService: Record<string, number> = {};
  for (const p of paymentsWithContacts || []) {
    const pDate = toDate(p.received_date) ?? toDate(p.created_at) ?? "2000-01-01";
    if (pDate < periodStart) continue;
    if (periodEnd && pDate >= periodEnd) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const services = (p.contacts as any)?.services || ["autre"];
    const mainService = Array.isArray(services) ? services[0] || "autre" : "autre";
    revenueByService[mainService] = (revenueByService[mainService] || 0) + (p.amount || 0);
  }

  // Jobs cette semaine
  const weekEnd = toDate(new Date(now.getTime() + 7 * 86400000).toISOString())!;
  const { data: upcomingJobs } = await supabaseAdmin
    .from("jobs")
    .select("id")
    .gte("scheduled_date", todayStr)
    .lte("scheduled_date", weekEnd);

  return NextResponse.json({
    period,
    totalRevenue,
    totalBilled,
    periodRevenue,
    prevRevenue,
    periodChange,
    periodDepenses,
    periodProfit,
    totalOwed,
    totalOverdue,
    overdueCount: overduePayments.length,
    totalDepenses,
    profitNet: totalRevenue - totalDepenses,
    totalClients,
    activeClients,
    totalLeads,
    conversionRate,
    lostClients,
    revenueByMonth,
    revenueByService,
    upcomingJobsThisWeek: upcomingJobs?.length || 0,
  });
}
