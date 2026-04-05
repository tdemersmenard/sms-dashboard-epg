export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { contactId, password } = await req.json();

  if (!contactId || !password) {
    return NextResponse.json({ error: "contactId et password requis" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);

  await supabaseAdmin.from("contacts").update({
    portal_password: hashed,
  }).eq("id", contactId);

  return NextResponse.json({ success: true });
}
