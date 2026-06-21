export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { isMasterUser, extractFranchiseId, GRANBY_FRANCHISE_ID } from "@/lib/franchise";
import { IMPERSONATE_COOKIE } from "@/lib/franchise-context";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  const u = user as Record<string, unknown>;
  const isMaster = isMasterUser(u);

  const cookieStore = await cookies();
  const impersonateCookie = isMaster ? (cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null) : null;

  let activeFranchiseId = extractFranchiseId(u);
  let impersonatingFranchiseName: string | null = null;

  if (impersonateCookie) {
    activeFranchiseId = impersonateCookie;
    const { data: f } = await supabaseAdmin
      .from("franchises")
      .select("name")
      .eq("id", impersonateCookie)
      .single();
    impersonatingFranchiseName = f?.name ?? null;
  }

  // Ne jamais exposer password_hash / totp_secret
  return NextResponse.json({
    user: {
      id:                          u.id,
      email:                       u.email,
      franchise_id:                u.franchise_id ?? null,
      is_master:                   isMaster,
      active_franchise_id:         activeFranchiseId || GRANBY_FRANCHISE_ID,
      impersonating:               impersonateCookie,
      impersonating_franchise_name: impersonatingFranchiseName,
    },
  });
}
