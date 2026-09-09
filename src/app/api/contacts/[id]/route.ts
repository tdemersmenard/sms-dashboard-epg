export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser, extractFranchiseId } from "@/lib/franchise";

/**
 * DELETE /api/contacts/[id] — suppression définitive d'un client.
 * Auth obligatoire + le contact doit appartenir à la franchise de l'utilisateur
 * (ou utilisateur master). Supprime d'abord les tables liées SANS cascade
 * (automation_logs, call_transcripts), puis le contact — messages, jobs,
 * documents et paiements suivent par cascade.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = params;
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, franchise_id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();

  if (!contact) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const u = user as Record<string, unknown>;
  if (!isMasterUser(u) && contact.franchise_id !== extractFranchiseId(u)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    // Tables liées sans ON DELETE CASCADE (une table absente n'est pas bloquante)
    await supabaseAdmin.from("automation_logs").delete().eq("contact_id", id);
    await supabaseAdmin.from("call_transcripts").delete().eq("contact_id", id).then(() => {}, () => {});
    await supabaseAdmin.from("water_tests").delete().eq("contact_id", id).then(() => {}, () => {});

    const { error } = await supabaseAdmin.from("contacts").delete().eq("id", id);
    if (error) throw error;

    console.log(`[contacts] supprimé: ${[contact.first_name, contact.last_name].filter(Boolean).join(" ")} (${id}) par ${u.email}`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Échec de la suppression";
    console.error("[contacts] delete error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
