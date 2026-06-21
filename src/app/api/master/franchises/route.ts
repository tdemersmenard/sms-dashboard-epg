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

// ─── GET: Liste toutes les franchises avec stats ──────────────────────────────
export async function GET() {
  const user = await requireMaster();
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { data: franchises, error } = await supabaseAdmin
    .from("franchises")
    .select("id, name, owner_name, owner_email, owner_phone, territory, status, franchise_fee_paid, royalty_percent, monthly_fee, twilio_phone_number, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrichir avec stats (clients + revenus du mois)
  const enriched = await Promise.all(
    (franchises ?? []).map(async (f) => {
      const [{ count: clientCount }, { count: activeJobCount }, { data: monthPayments }] = await Promise.all([
        supabaseAdmin.from("contacts").select("id", { count: "exact", head: true }).eq("franchise_id", f.id),
        supabaseAdmin.from("jobs").select("id", { count: "exact", head: true })
          .eq("franchise_id", f.id).not("status", "in", "(complété,annulé)").gte("scheduled_date", new Date().toISOString().split("T")[0]),
        supabaseAdmin.from("payments").select("amount")
          .eq("franchise_id", f.id).eq("status", "reçu")
          .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);

      const monthRevenue = (monthPayments ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0);
      const royaltyDue   = Math.round(monthRevenue * (f.royalty_percent / 100) * 100) / 100;

      return {
        ...f,
        stats: {
          clientCount:   clientCount ?? 0,
          activeJobCount: activeJobCount ?? 0,
          monthRevenue,
          royaltyDue,
          monthlyFee: f.monthly_fee,
          totalDue:   royaltyDue + f.monthly_fee,
        },
      };
    })
  );

  return NextResponse.json({ franchises: enriched });
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

  const insert: Record<string, unknown> = {
    name, owner_name, owner_email, owner_phone,
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
