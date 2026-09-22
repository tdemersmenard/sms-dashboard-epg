export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser } from "@/lib/franchise";

/**
 * Assignation des leads aux closers — ADMIN seulement.
 * GET  → leads non assignés + closers actifs.
 * POST → assigner {leadIds, closerId} OU répartir en rotation {leadIds, rotate:true}.
 *        Journalise dans assignment_history. Réassignation = même route.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user as Record<string, unknown>)) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const [{ data: leads, error }, { data: closers }] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, city, pool_type, lead_source, stage, created_at")
      .is("assigned_to", null)
      .in("lead_source", ["meta_saison_2027", "site_chrono", "self_serve", "meta_spa"])
      .not("stage", "in", '("closé","complété","perdu")')
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("profiles").select("id, full_name").eq("role", "closer").eq("active", true),
  ]);
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ leads: [], closers: [], migrationRequired: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ leads: leads || [], closers: closers || [] });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const adminId = (admin as { id?: string }).id ?? null;

  const { leadIds, closerId, rotate } = await req.json();
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds requis" }, { status: 400 });
  }

  // Cible(s) d'assignation
  let targets: string[];
  if (rotate) {
    const { data: closers } = await supabaseAdmin.from("profiles").select("id").eq("role", "closer").eq("active", true).order("created_at");
    if (!closers || closers.length === 0) return NextResponse.json({ error: "Aucun closer actif" }, { status: 400 });
    targets = closers.map((c) => c.id);
  } else {
    if (!closerId) return NextResponse.json({ error: "closerId requis" }, { status: 400 });
    targets = [closerId];
  }

  const now = new Date().toISOString();
  let i = 0;
  for (const leadId of leadIds) {
    const to = targets[i % targets.length];
    i++;
    // état précédent (pour l'audit)
    const { data: prev } = await supabaseAdmin.from("contacts").select("assigned_to, pipeline_status").eq("id", leadId).maybeSingle();
    await supabaseAdmin.from("contacts").update({
      assigned_to: to,
      assigned_at: now,
      ...(prev?.pipeline_status ? {} : { pipeline_status: "nouveau" }),
    }).eq("id", leadId);
    await supabaseAdmin.from("assignment_history").insert({
      lead_id: leadId, from_closer: prev?.assigned_to ?? null, to_closer: to, assigned_by: adminId,
    });
  }

  return NextResponse.json({ ok: true, assigned: leadIds.length, rotated: !!rotate, closers: targets.length });
}
