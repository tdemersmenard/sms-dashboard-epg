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

  return NextResponse.json({
    user: {
      id:                  u.id,
      email:               u.email,
      franchise_id:        u.franchise_id ?? null,
      is_master:           isMaster,
      active_franchise_id: franchiseId,
      franchise_slug:      franchiseSlug,
    },
  });
}
