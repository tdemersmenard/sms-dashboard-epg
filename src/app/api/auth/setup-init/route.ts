export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";

export async function POST() {
  const password = "Chlore2026!";
  const hash = await hashPassword(password);

  await supabaseAdmin
    .from("admin_users")
    .update({ password_hash: hash })
    .eq("email", "thomasdemersmenard@hotmail.com");

  return NextResponse.json({ success: true, password });
}
