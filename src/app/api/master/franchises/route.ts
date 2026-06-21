export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { isMasterUser, encryptSecret } from "@/lib/franchise";

async function requireMaster() {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user as Record<string, unknown>)) return null;
  return user;
}

// ─── Period helpers ──────────────────────────────────────────────────────────
function getPeriodRange(period: string, customStart?: string, customEnd?: string): { start: string; end: string | null; monthCount: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");

  switch (period) {
    case "season":
      return { start: `${y}-04-01`, end: null, monthCount: Math.max(0, m - 3 + 1) };
    case "month":
      return { start: `${y}-${pad(m + 1)}-01`, end: null, monthCount: 1 };
    case "year":
      return { start: `${y}-01-01`, end: null, monthCount: m + 1 };
    case "custom":
      if (customStart) {
        const cs = new Date(customStart);
        const ce = customEnd ? new Date(customEnd) : now;
        const months = Math.max(1, Math.ceil((ce.getTime() - cs.getTime()) / (30 * 86400000)));
        return { start: customStart, end: customEnd || null, monthCount: months };
      }
      return { start: `${y}-04-01`, end: null, monthCount: Math.max(0, m - 3 + 1) };
    default:
      return { start: `${y}-04-01`, end: null, monthCount: Math.max(0, m - 3 + 1) };
  }
}

// ─── GET: Liste toutes les franchises avec stats ──────────────────────────────
export async function GET(req: NextRequest) {
  const user = await requireMaster();
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const period = req.nextUrl.searchParams.get("period") || "season";
  const customStart = req.nextUrl.searchParams.get("start") || undefined;
  const customEnd = req.nextUrl.searchParams.get("end") || undefined;
  const { start: periodStart, end: periodEnd, monthCount } = getPeriodRange(period, customStart, customEnd);

  const { data: franchises, error } = await supabaseAdmin
    .from("franchises")
    .select("id, name, slug, owner_name, owner_email, owner_phone, territory, status, franchise_fee_paid, royalty_percent, monthly_fee, twilio_phone_number, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await Promise.all(
    (franchises ?? []).map(async (f) => {
      // Build payments query for the selected period
      let paymentsQuery = supabaseAdmin.from("payments").select("amount, received_date, created_at")
        .eq("franchise_id", f.id).eq("status", "reçu")
        .gte("created_at", new Date(periodStart).toISOString());
      if (periodEnd) {
        paymentsQuery = paymentsQuery.lte("created_at", new Date(periodEnd + "T23:59:59").toISOString());
      }

      const [{ count: clientCount }, { count: activeJobCount }, { data: periodPayments }] = await Promise.all([
        supabaseAdmin.from("contacts").select("id", { count: "exact", head: true }).eq("franchise_id", f.id),
        supabaseAdmin.from("jobs").select("id", { count: "exact", head: true })
          .eq("franchise_id", f.id).not("status", "in", "(complété,annulé)").gte("scheduled_date", new Date().toISOString().split("T")[0]),
        paymentsQuery,
      ]);

      const periodRevenue = (periodPayments ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0);
      const royaltyDue = Math.round(periodRevenue * (f.royalty_percent / 100) * 100) / 100;
      const monthlyFees = f.status === "active" ? monthCount * f.monthly_fee : 0;

      return {
        ...f,
        stats: {
          clientCount: clientCount ?? 0,
          activeJobCount: activeJobCount ?? 0,
          periodRevenue,
          royaltyDue,
          monthlyFee: f.monthly_fee,
          monthlyFees,
          totalDue: royaltyDue + monthlyFees,
        },
      };
    })
  );

  return NextResponse.json({ franchises: enriched, period, periodStart, periodEnd: periodEnd || null, monthCount });
}

// ─── POST: Créer une nouvelle franchise ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await requireMaster();
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await req.json();
  const {
    name, owner_name, owner_email, owner_phone,
    business_address, territory,
    twilio_account_sid, twilio_auth_token, twilio_phone_number,
    email, payment_interac_email,
    owner_password,
  } = body;

  if (!name) return NextResponse.json({ error: "name requis" }, { status: 400 });

  // Generate slug from name: "Entretien Piscine Sherbrooke" → "sherbrooke"
  const slug = name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/entretien\s+piscine\s*/i, "") // remove common prefix
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanum with dashes
    .replace(/^-|-$/g, "") // trim dashes
    || "franchise";

  const insert: Record<string, unknown> = {
    name, slug, owner_name, owner_email, owner_phone,
    business_address, territory,
    twilio_account_sid, twilio_phone_number,
    email, payment_interac_email,
    status: "pending",
  };

  if (twilio_auth_token) {
    insert.twilio_auth_token_encrypted = encryptSecret(twilio_auth_token);
  }

  const { data: franchise, error } = await supabaseAdmin
    .from("franchises")
    .insert(insert)
    .select("id, name, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Créer le compte admin_user du franchisé si email + mot de passe fournis
  if (owner_email && owner_password && franchise) {
    const password_hash = await hashPassword(owner_password);
    await supabaseAdmin.from("admin_users").insert({
      email:        owner_email,
      password_hash,
      franchise_id: franchise.id,
      is_master:    false,
      active:       true,
    });
  }

  return NextResponse.json({ franchise });
}

// ─── PATCH: Modifier le statut / infos d'une franchise ───────────────────────
export async function PATCH(req: NextRequest) {
  const user = await requireMaster();
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  // Chiffrer le auth_token si fourni
  if (updates.twilio_auth_token) {
    updates.twilio_auth_token_encrypted = encryptSecret(updates.twilio_auth_token);
    delete updates.twilio_auth_token;
  }

  const { error } = await supabaseAdmin
    .from("franchises")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
