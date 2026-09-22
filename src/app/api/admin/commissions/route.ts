export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser } from "@/lib/franchise";

/**
 * Commissions — ADMIN seulement (auth custom + is_master).
 * GET  → agrégats par closer + liste détaillée (filtre période).
 * POST → marquer un lot payé { closerId, ids? } (fin de semaine).
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user as Record<string, unknown>)) return null;
  return user;
}

const money = (cents: number) => Math.round(cents) / 100;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const period = new URL(req.url).searchParams.get("period") || "all"; // semaine | mois | all
  let since: string | null = null;
  const now = new Date();
  if (period === "semaine") { const d = new Date(now); d.setDate(d.getDate() - 7); since = d.toISOString(); }
  else if (period === "mois") { const d = new Date(now); d.setMonth(d.getMonth() - 1); since = d.toISOString(); }

  let q = supabaseAdmin
    .from("commissions")
    .select("id, closer_id, lead_id, amount_cents, kind, status, earned_at, paid_at, cancelled_reason")
    .order("earned_at", { ascending: false });
  if (since) q = q.gte("earned_at", since);
  const { data: comms, error } = await q;
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ closers: [], commissions: [], migrationRequired: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Noms des closers + des leads
  const closerIds = Array.from(new Set((comms || []).map((c) => c.closer_id).filter(Boolean)));
  const leadIds = Array.from(new Set((comms || []).map((c) => c.lead_id).filter(Boolean)));
  const [{ data: profiles }, { data: leads }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, full_name").in("id", closerIds.length ? closerIds : ["00000000-0000-0000-0000-000000000000"]),
    supabaseAdmin.from("contacts").select("id, first_name, last_name").in("id", leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.full_name || "Closer";
  const leadName = (id: string) => { const l = leads?.find((x) => x.id === id); return l ? [l.first_name, l.last_name].filter(Boolean).join(" ") : "Client"; };

  // Total encaissé POUR MOI par closer (paiements reçus créés par le closer) — coût d'acquisition
  const { data: pays } = await supabaseAdmin
    .from("payments").select("amount, created_by, received_date").eq("status", "reçu").not("created_by", "is", null);
  const encaisseByCloser: Record<string, number> = {};
  for (const p of pays || []) {
    if (since && p.received_date && new Date(p.received_date) < new Date(since)) continue;
    if (p.created_by) encaisseByCloser[p.created_by] = (encaisseByCloser[p.created_by] || 0) + Number(p.amount || 0);
  }

  // Agrégats par closer
  const byCloser: Record<string, { closerId: string; name: string; a_payer: number; paye: number; annulee: number; contrats: number; encaisse: number }> = {};
  for (const c of comms || []) {
    const k = c.closer_id;
    if (!byCloser[k]) byCloser[k] = { closerId: k, name: nameOf(k), a_payer: 0, paye: 0, annulee: 0, contrats: 0, encaisse: money((encaisseByCloser[k] || 0) * 100) };
    if (c.status === "a_payer") byCloser[k].a_payer += c.amount_cents;
    else if (c.status === "paye") byCloser[k].paye += c.amount_cents;
    else if (c.status === "annulee") byCloser[k].annulee += c.amount_cents;
    if (c.kind === "base" && c.status !== "annulee") byCloser[k].contrats += 1;
  }
  const closers = Object.values(byCloser).map((c) => ({
    ...c, a_payer: money(c.a_payer), paye: money(c.paye), annulee: money(c.annulee),
    cout_acquisition: c.encaisse > 0 ? Math.round(((c.paye + c.a_payer) / c.encaisse) * 1000) / 10 : null,
  }));

  const commissions = (comms || []).map((c) => ({
    id: c.id, closer: nameOf(c.closer_id), lead: leadName(c.lead_id),
    amount: money(c.amount_cents), kind: c.kind, status: c.status,
    earned_at: c.earned_at, paid_at: c.paid_at, cancelled_reason: c.cancelled_reason,
  }));

  return NextResponse.json({ closers, commissions });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const { closerId, ids } = await req.json();

  let q = supabaseAdmin.from("commissions").update({ status: "paye", paid_at: new Date().toISOString() }).eq("status", "a_payer");
  if (Array.isArray(ids) && ids.length) q = q.in("id", ids);
  else if (closerId) q = q.eq("closer_id", closerId);
  else return NextResponse.json({ error: "closerId ou ids requis" }, { status: 400 });

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
