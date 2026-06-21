export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  // Ne jamais exposer password_hash / totp_secret
  return NextResponse.json({
    user: {
      id:           user.id,
      email:        user.email,
      franchise_id: (user as Record<string, unknown>).franchise_id ?? null,
      is_master:    !!(user as Record<string, unknown>).is_master,
    },
  });
}
