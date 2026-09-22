export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser } from "@/lib/franchise";

/**
 * Info vendeur d'un lead pour la fiche admin: closer assigné, paiements (avec
 * QUI les a créés), appels journalisés. Service role → pas de souci RLS.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user as Record<string, unknown>)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const leadId = new URL(req.url).searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId requis" }, { status: 400 });

  try {
    const [{ data: lead }, { data: payments }, { data: calls }] = await Promise.all([
      supabaseAdmin.from("contacts").select("assigned_to, pipeline_status").eq("id", leadId).maybeSingle(),
      supabaseAdmin.from("payments").select("id, amount, status, kind, plan, created_by, created_at, received_date, notes").eq("contact_id", leadId).order("created_at", { ascending: false }),
      supabaseAdmin.from("call_logs").select("id, outcome, notes, objection, called_at, closer_id, next_callback_at").eq("lead_id", leadId).order("called_at", { ascending: false }),
    ]);

    // Noms des profils impliqués
    const pids = Array.from(new Set([lead?.assigned_to, ...(payments || []).map((p) => p.created_by), ...(calls || []).map((c) => c.closer_id)].filter(Boolean))) as string[];
    const { data: profiles } = pids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", pids)
      : { data: [] };
    const nameOf = (id: string | null) => (id ? profiles?.find((p) => p.id === id)?.full_name || "Closer" : null);

    return NextResponse.json({
      assignedCloser: nameOf(lead?.assigned_to ?? null),
      pipelineStatus: lead?.pipeline_status ?? null,
      payments: (payments || []).map((p) => ({ ...p, creator: nameOf(p.created_by) })),
      calls: (calls || []).map((c) => ({ ...c, closer: nameOf(c.closer_id) })),
    });
  } catch (e) {
    // tables pas encore migrées → réponse vide, la fiche s'affiche quand même
    return NextResponse.json({ assignedCloser: null, pipelineStatus: null, payments: [], calls: [], note: String(e) });
  }
}
