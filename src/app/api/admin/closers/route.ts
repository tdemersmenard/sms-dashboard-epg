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

  // Emails depuis auth.users (via l'API admin)
  const withEmail = await Promise.all(
    (closers || []).map(async (c) => {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(c.id);
      return { ...c, email: u?.user?.email ?? null };
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
    const { id, active, commissionFlatCents, bonusComptantCents } = await req.json();
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof active === "boolean") patch.active = active;
    if (Number.isInteger(commissionFlatCents)) patch.commission_flat_cents = commissionFlatCents;
    if (Number.isInteger(bonusComptantCents)) patch.bonus_comptant_cents = bonusComptantCents;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Rien à modifier" }, { status: 400 });

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", id).eq("role", "closer");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
