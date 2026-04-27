export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function getPeriodStart(period: string, now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (period) {
    case "today":   return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    case "7d":      return new Date(now.getTime() - 7  * 86400000).toISOString().split("T")[0];
    case "30d":     return new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
    case "90d":     return new Date(now.getTime() - 90 * 86400000).toISOString().split("T")[0];
    case "year":    return `${y}-01-01`;
    default:        return "2000-01-01"; // all
  }
}

function getPrevPeriodStart(period: string, now: Date): string {
  switch (period) {
    case "today":   return new Date(now.getTime() - 1  * 86400000).toISOString().split("T")[0];
    case "7d":      return new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0];
    case "30d":     return new Date(now.getTime() - 60 * 86400000).toISOString().split("T")[0];
    case "90d":     return new Date(now.getTime() - 180 * 86400000).toISOString().split("T")[0];
    case "year":    return `${now.getFullYear() - 1}-01-01`;
    default:        return "2000-01-01";
  }
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "30d";
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const periodStart = getPeriodStart(period, now);
  const prevStart   = getPrevPeriodStart(period, now);

  // Tous les paiements
  const { data: allPayments } = await supabaseAdmin
    .from("payments")
    .select("amount, status, received_date, due_date, created_at");

  const received = (allPayments || []).filter(p => p.status === "reçu");

  // Revenu total (all time)
  const totalRevenue = received.reduce((s, p) => s + (p.amount || 0), 0);

  // Revenu période sélectionnée
  const periodRevenue = received
    .filter(p => p.received_date && p.received_date >= periodStart)
    .reduce((s, p) => s + (p.amount || 0), 0);

  // Revenu période précédente (pour le % change)
  const prevRevenue = received
    .filter(p => p.received_date && p.received_date >= prevStart && p.received_date < periodStart)
    .reduce((s, p) => s + (p.amount || 0), 0);

  const periodChange = prevRevenue > 0
    ? Math.round(((periodRevenue - prevRevenue) / prevRevenue) * 100)
    : null;

  // À recevoir & en retard (toujours all-time)
  const totalOwed = (allPayments || [])
    .filter(p => p.status === "en_attente")
    .reduce((s, p) => s + (p.amount || 0), 0);

  const overduePayments = (allPayments || [])
    .filter(p => p.status === "en_attente" && p.due_date && p.due_date < todayStr);

  const totalOverdue = overduePayments.reduce((s, p) => s + (p.amount || 0), 0);

  // Dépenses
  const { data: depenses } = await supabaseAdmin
    .from("depenses")
    .select("montant, date, categorie");

  const totalDepenses = (depenses || []).reduce((s, d) => s + (d.montant || 0), 0);

  const periodDepenses = (depenses || [])
    .filter(d => d.date && d.date >= periodStart)
    .reduce((s, d) => s + (d.montant || 0), 0);

  const periodProfit = periodRevenue - periodDepenses;

  // Contacts stats (all-time, pas affecté par la période)
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, stage, phone")
    .neq("phone", "+14509942215");

  const totalClients  = (contacts || []).filter(c => ["closé", "planifié", "complété"].includes(c.stage || "")).length;
  const activeClients = (contacts || []).filter(c => ["closé", "planifié"].includes(c.stage || "")).length;
  const totalLeads    = (contacts || []).length;
  const conversionRate = totalLeads > 0 ? Math.round((totalClients / totalLeads) * 100) : 0;
  const lostClients   = (contacts || []).filter(c => c.stage === "perdu").length;

  // Graphique — 6 derniers mois (toujours)
  const currentMonth = now.getMonth();
  const currentYear  = now.getFullYear();
  const revenueByMonth: { month: string; revenue: number; depenses: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split("T")[0];
    const label  = d.toLocaleDateString("fr-CA", { month: "short" });
    const rev = received
      .filter(p => p.received_date && p.received_date >= mStart && p.received_date < mEnd)
      .reduce((s, p) => s + (p.amount || 0), 0);
    const dep = (depenses || [])
      .filter(dd => dd.date && dd.date >= mStart && dd.date < mEnd)
      .reduce((s, dd) => s + (dd.montant || 0), 0);
    revenueByMonth.push({ month: label, revenue: rev, depenses: dep });
  }

  // Revenus par service (période sélectionnée)
  const { data: paymentsWithContacts } = await supabaseAdmin
    .from("payments")
    .select("amount, status, received_date, contact_id, contacts(services)")
    .eq("status", "reçu")
    .gte("received_date", periodStart);

  const revenueByService: Record<string, number> = {};
  for (const p of paymentsWithContacts || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const services = (p.contacts as any)?.services || ["autre"];
    const mainService = Array.isArray(services) ? services[0] || "autre" : "autre";
    revenueByService[mainService] = (revenueByService[mainService] || 0) + (p.amount || 0);
  }

  // Jobs cette semaine
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
  const { data: upcomingJobs } = await supabaseAdmin
    .from("jobs")
    .select("id")
    .gte("scheduled_date", todayStr)
    .lte("scheduled_date", weekEnd);

  return NextResponse.json({
    period,
    totalRevenue,
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
