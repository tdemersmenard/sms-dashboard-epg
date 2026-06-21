export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

function getSeasonStart(year: number): string {
  return `${year}-04-01`;
}

export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();

    // Franchise info
    const { data: franchise, error } = await supabaseAdmin
      .from("franchises")
      .select("name, royalty_percent, monthly_fee, franchise_fee_paid, created_at, status")
      .eq("id", franchiseId)
      .single();

    if (error || !franchise) {
      return NextResponse.json({ error: "Franchise introuvable" }, { status: 404 });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const seasonStart = getSeasonStart(currentYear);

    // All received payments for this franchise
    const { data: allPayments } = await supabaseAdmin
      .from("payments")
      .select("amount, status, received_date, created_at")
      .eq("franchise_id", franchiseId)
      .eq("status", "reçu");

    const payments = allPayments || [];

    // Season revenue (April 1 to now)
    const seasonRevenue = payments
      .filter(p => {
        const d = (p.received_date || p.created_at || "").slice(0, 10);
        return d >= seasonStart;
      })
      .reduce((s, p) => s + (p.amount || 0), 0);

    // Current month revenue
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const monthRevenue = payments
      .filter(p => {
        const d = (p.received_date || p.created_at || "").slice(0, 10);
        return d >= monthStart;
      })
      .reduce((s, p) => s + (p.amount || 0), 0);

    // All-time revenue
    const totalRevenue = payments.reduce((s, p) => s + (p.amount || 0), 0);

    const royaltyPercent = franchise.royalty_percent ?? 8;
    const monthlyFee = franchise.monthly_fee ?? 200;

    // Calculate months active in the season (April to current month)
    const seasonStartMonth = 3; // April = index 3
    const monthsInSeason = currentMonth >= seasonStartMonth
      ? currentMonth - seasonStartMonth + 1
      : 0;

    const seasonRoyalties = Math.round(seasonRevenue * (royaltyPercent / 100) * 100) / 100;
    const seasonMonthlyFees = monthsInSeason * monthlyFee;
    const seasonTotal = seasonRoyalties + seasonMonthlyFees;

    // Monthly breakdown for the current season
    const monthlyBreakdown: Array<{
      month: string;
      revenue: number;
      royalty: number;
      monthlyFee: number;
      total: number;
    }> = [];

    for (let m = seasonStartMonth; m <= currentMonth; m++) {
      const mStart = `${currentYear}-${String(m + 1).padStart(2, "0")}-01`;
      const mEnd = m < 11
        ? `${currentYear}-${String(m + 2).padStart(2, "0")}-01`
        : `${currentYear + 1}-01-01`;

      const mRevenue = payments
        .filter(p => {
          const d = (p.received_date || p.created_at || "").slice(0, 10);
          return d >= mStart && d < mEnd;
        })
        .reduce((s, p) => s + (p.amount || 0), 0);

      const mRoyalty = Math.round(mRevenue * (royaltyPercent / 100) * 100) / 100;
      const label = new Date(currentYear, m, 1).toLocaleDateString("fr-CA", { month: "long" });

      monthlyBreakdown.push({
        month: label,
        revenue: mRevenue,
        royalty: mRoyalty,
        monthlyFee,
        total: mRoyalty + monthlyFee,
      });
    }

    return NextResponse.json({
      franchiseName: franchise.name,
      royaltyPercent,
      monthlyFee,
      franchiseFeePaid: franchise.franchise_fee_paid ?? false,
      franchiseFee: 10000,
      seasonRevenue,
      seasonRoyalties,
      seasonMonthlyFees,
      seasonTotal,
      monthRevenue,
      totalRevenue,
      monthlyBreakdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
