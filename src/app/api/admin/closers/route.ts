export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser } from "@/lib/franchise";
import { GRANBY_FRANCHISE_ID } from "@/lib/franchise";

/**
 * Gestion des comptes closers — RÉSERVÉ à l'admin (auth custom + is_master).
 * Les closers sont des comptes Supabase Auth (auth.users) + une ligne profiles.
 * Pas d'auto-inscription: seul Thomas crée les comptes.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user as Record<string, unknown>)) return null;
  return user;
}

// GET — liste des closers avec quelques compteurs
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const { data: closers, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, phone, role, active, commission_flat_cents, bonus_comptant_cents, created_at")
    .eq("role", "closer")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") return NextResponse.json({ closers: [], migrationRequired: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Perf: leads assignés, appels, contact, ventes, valeur, conversion
  const ids = (closers || []).map((c) => c.id);
  const [{ data: leads }, { data: calls }, { data: pays }] = await Promise.all([
    supabaseAdmin.from("contacts").select("assigned_to, pipeline_status").in("assigned_to", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    supabaseAdmin.from("call_logs").select("closer_id, outcome").in("closer_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    supabaseAdmin.from("payments").select("created_by, amount, status, kind").eq("status", "reçu").in("created_by", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const withEmail = await Promise.all(
    (closers || []).map(async (c) => {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(c.id);
      const myLeads = (leads || []).filter((l) => l.assigned_to === c.id);
      const myCalls = (calls || []).filter((x) => x.closer_id === c.id);
      const myPays = (pays || []).filter((p) => p.created_by === c.id);
      const contacted = myLeads.filter((l) => l.pipeline_status && l.pipeline_status !== "nouveau").length;
      const clients = myLeads.filter((l) => l.pipeline_status === "client" || l.pipeline_status === "depot_paye").length;
      return {
        ...c, email: u?.user?.email ?? null,
        perf: {
          assignes: myLeads.length,
          appels: myCalls.length,
          taux_contact: myLeads.length ? Math.round((contacted / myLeads.length) * 100) : 0,
          depots: myPays.length,
          valeur: Math.round(myPays.reduce((s, p) => s + Number(p.amount || 0), 0)),
          conversion: myLeads.length ? Math.round((clients / myLeads.length) * 100) : 0,
        },
      };
    }),
  );

  return NextResponse.json({ closers: withEmail });
}

// POST — créer un compte closer
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  try {
    const { fullName, email, password, phone, commissionFlatCents, bonusComptantCents } = await req.json();
    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Email et mot de passe (min 8 caractères) requis" }, { status: 400 });
    }

    // 1. Compte Supabase Auth (email confirmé d'office — pas de flow d'inscription)
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { role: "closer", full_name: fullName ?? null },
    });
    if (authErr || !created?.user) {
      return NextResponse.json({ error: authErr?.message || "Création du compte échouée" }, { status: 400 });
    }

    // 2. Profil (role closer)
    const { error: profErr } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      full_name: fullName ?? null,
      role: "closer",
      active: true,
      phone: phone ?? null,
      franchise_id: GRANBY_FRANCHISE_ID,
      ...(Number.isInteger(commissionFlatCents) ? { commission_flat_cents: commissionFlatCents } : {}),
      ...(Number.isInteger(bonusComptantCents) ? { bonus_comptant_cents: bonusComptantCents } : {}),
    });
    if (profErr) {
      // rollback: supprimer le compte auth si le profil échoue
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return NextResponse.json({ error: `Profil: ${profErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: created.user.id });
  } catch (e) {
    console.error("[closers POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH — activer/désactiver ou ajuster les commissions
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  try {
    const { id, active, commissionFlatCents, bonusComptantCents, fullName, phone, email, password } = await req.json();
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    // ── Profil (nom, téléphone, commissions, actif) ──
    const patch: Record<string, unknown> = {};
    if (typeof active === "boolean") patch.active = active;
    if (typeof fullName === "string") patch.full_name = fullName.trim() || null;
    if (typeof phone === "string") patch.phone = phone.trim() || null;
    if (Number.isInteger(commissionFlatCents)) patch.commission_flat_cents = commissionFlatCents;
    if (Number.isInteger(bonusComptantCents)) patch.bonus_comptant_cents = bonusComptantCents;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", id).eq("role", "closer");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Compte Supabase Auth (courriel, mot de passe) ──
    const authPatch: { email?: string; password?: string } = {};
    if (typeof email === "string" && email.trim()) authPatch.email = email.trim().toLowerCase();
    if (typeof password === "string" && password) {
      if (password.length < 8) return NextResponse.json({ error: "Mot de passe: min 8 caractères" }, { status: 400 });
      authPatch.password = password;
    }
    if (Object.keys(authPatch).length > 0) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(id, authPatch);
      if (authErr) return NextResponse.json({ error: `Compte: ${authErr.message}` }, { status: 400 });
    }

    // Désactiver = bannir la connexion Supabase Auth aussi
    if (active === false) {
      await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: "876000h" }).catch(() => {});
    } else if (active === true) {
      await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: "none" }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
