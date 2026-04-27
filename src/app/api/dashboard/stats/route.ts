export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const lastMonthStart = currentMonth === 0
    ? `${currentYear - 1}-12-01`
    : `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;

  // Revenus totaux (paiements reçus)
  const { data: allPayments } = await supabaseAdmin
    .from("payments")
    .select("amount, status, received_date, due_date, created_at");

  const totalRevenue = (allPayments || [])
    .filter(p => p.status === "reçu")
    .reduce((s, p) => s + (p.amount || 0), 0);

  const monthRevenue = (allPayments || [])
    .filter(p => p.status === "reçu" && p.received_date && p.received_date >= monthStart)
    .reduce((s, p) => s + (p.amount || 0), 0);

  const lastMonthRevenue = (allPayments || [])
    .filter(p => p.status === "reçu" && p.received_date && p.received_date >= lastMonthStart && p.received_date < monthStart)
    .reduce((s, p) => s + (p.amount || 0), 0);

  const totalOwed = (allPayments || [])
    .filter(p => p.status === "en_attente")
    .reduce((s, p) => s + (p.amount || 0), 0);

  const overduePayments = (allPayments || [])
    .filter(p => p.status === "en_attente" && p.due_date && p.due_date < now.toISOString().split("T")[0]);

  const totalOverdue = overduePayments.reduce((s, p) => s + (p.amount || 0), 0);

  // Dépenses
  const { data: depenses } = await supabaseAdmin
    .from("depenses")
    .select("montant, date, categorie");

  const totalDepenses = (depenses || []).reduce((s, d) => s + (d.montant || 0), 0);

  const monthDepenses = (depenses || [])
    .filter(d => d.date && d.date >= monthStart)
    .reduce((s, d) => s + (d.montant || 0), 0);

  // Contacts stats
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, stage, created_at, phone")
    .neq("phone", "+14509942215"); // Exclure Thomas

  const totalClients = (contacts || []).filter(c =>
    ["closé", "planifié", "complété"].includes(c.stage || "")
  ).length;

  const totalLeads = (contacts || []).length;
  const conversionRate = totalLeads > 0 ? Math.round((totalClients / totalLeads) * 100) : 0;

  const activeClients = (contacts || []).filter(c =>
    ["closé", "planifié"].includes(c.stage || "")
  ).length;

  const lostClients = (contacts || []).filter(c => c.stage === "perdu").length;

  // Revenus par mois (6 derniers mois) pour le graphique
  const revenueByMonth: { month: string; revenue: number; depenses: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split("T")[0];
    const monthLabel = d.toLocaleDateString("fr-CA", { month: "short" });

    const rev = (allPayments || [])
      .filter(p => p.status === "reçu" && p.received_date && p.received_date >= mStart && p.received_date < mEnd)
      .reduce((s, p) => s + (p.amount || 0), 0);

    const dep = (depenses || [])
      .filter(dd => dd.date && dd.date >= mStart && dd.date < mEnd)
      .reduce((s, dd) => s + (dd.montant || 0), 0);

    revenueByMonth.push({ month: monthLabel, revenue: rev, depenses: dep });
  }

  // Revenus par service
  const { data: paymentsWithContacts } = await supabaseAdmin
    .from("payments")
    .select("amount, status, contact_id, contacts(services)")
    .eq("status", "reçu");

  const revenueByService: Record<string, number> = {};
  for (const p of paymentsWithContacts || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const services = (p.contacts as any)?.services || ["autre"];
    const mainService = Array.isArray(services) ? services[0] || "autre" : "autre";
    revenueByService[mainService] = (revenueByService[mainService] || 0) + (p.amount || 0);
  }

  // Jobs à venir cette semaine
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: upcomingJobs } = await supabaseAdmin
    .from("jobs")
    .select("id")
    .gte("scheduled_date", now.toISOString().split("T")[0])
    .lte("scheduled_date", weekEnd);

  return NextResponse.json({
    totalRevenue,
    monthRevenue,
    lastMonthRevenue,
    monthRevenueChange: lastMonthRevenue > 0
      ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : null,
    totalOwed,
    totalOverdue,
    overdueCount: overduePayments.length,
    totalDepenses,
    monthDepenses,
    profitNet: totalRevenue - totalDepenses,
    monthProfit: monthRevenue - monthDepenses,
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
