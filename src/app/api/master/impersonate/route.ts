export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser } from "@/lib/franchise";
import { IMPERSONATE_COOKIE } from "@/lib/franchise-context";

async function requireMaster() {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user as Record<string, unknown>)) return null;
  return user;
}

// POST: set impersonation cookie → gérer une franchise en tant que Thomas
export async function POST(req: NextRequest) {
  const user = await requireMaster();
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { franchiseId } = await req.json();
  if (!franchiseId) return NextResponse.json({ error: "franchiseId requis" }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(IMPERSONATE_COOKIE, franchiseId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 heures
  });
  return res;
}

// DELETE: clear impersonation cookie → retour au Master
export async function DELETE() {
  const user = await requireMaster();
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(IMPERSONATE_COOKIE);
  return res;
}
