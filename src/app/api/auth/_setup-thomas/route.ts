export const dynamic = "force-dynamic";

// ⚠️  ENDPOINT TEMPORAIRE — À SUPPRIMER APRÈS USAGE
// Appeler une seule fois: POST /api/auth/_setup-thomas
// Cela va setter le mot de passe initial de Thomas à "Chlore2026!"
// Changer le mot de passe dans /settings après le premier login.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";

export async function POST() {
  const password = "Chlore2026!";
  const hash = await hashPassword(password);

  const { error } = await supabaseAdmin
    .from("admin_users")
    .update({ password_hash: hash })
    .eq("email", "thomasdemersmenard@hotmail.com");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Mot de passe initial configuré. SUPPRIME cet endpoint maintenant.",
    password,
  });
}
