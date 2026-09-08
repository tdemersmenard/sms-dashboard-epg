export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser, extractFranchiseId, GRANBY_FRANCHISE_ID } from "@/lib/franchise";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  const u = user as Record<string, unknown>;
  const isMaster = isMasterUser(u);
  const franchiseId = extractFranchiseId(u) || GRANBY_FRANCHISE_ID;

  // Resolve the user's franchise slug
  let franchiseSlug: string | null = null;
  if (franchiseId) {
    const { data: f } = await supabaseAdmin
      .from("franchises")
      .select("slug")
      .eq("id", franchiseId)
      .single();
    franchiseSlug = f?.slug ?? null;
  }

  const res = NextResponse.json({
    user: {
      id:                  u.id,
      email:               u.email,
      franchise_id:        u.franchise_id ?? null,
      is_master:           isMaster,
      active_franchise_id: franchiseId,
      franchise_slug:      franchiseSlug,
    },
  });

  // Auto-réparation du cookie de rôle: les sessions durent 365 jours et les
  // sessions créées avant le système de rôles n'ont jamais reçu chlore_role —
  // sans lui, le middleware bloque les pages master (ex: Dépenses → dashboard).
  res.cookies.set("chlore_role", isMaster ? "master" : "owner", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    path: "/",
  });

  return res;
}
