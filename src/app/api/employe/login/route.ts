export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { makeEmployeeToken } from "@/lib/employe-auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "email et mot de passe requis" }, { status: 400 });

    const { data: employee, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, email, password_hash, active")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (error?.code === "42P01") {
      return NextResponse.json({ error: "migration_required" }, { status: 503 });
    }

    if (!employee || !employee.active) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    if (!employee.password_hash) {
      return NextResponse.json({ error: "no_password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, employee.password_hash);
    if (!valid) return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });

    const token = makeEmployeeToken(employee.id);

    const res = NextResponse.json({ ok: true, employee: { id: employee.id, name: employee.name } });
    res.cookies.set("employe_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("employe_session", "", { maxAge: 0, path: "/" });
  return res;
}
