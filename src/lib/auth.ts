import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "chlore_session";
const SESSION_DURATION_DAYS = 365;

export async function createSession(userId: string, userAgent?: string, ip?: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await supabaseAdmin.from("admin_sessions").insert({
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
    user_agent: userAgent ?? null,
    ip_address: ip ?? null,
    totp_pending: false,
  });

  await supabaseAdmin
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);

  return { token, expiresAt };
}

/** Crée une session temporaire en attente de validation TOTP (expire dans 5 min) */
export async function createPendingSession(userId: string, userAgent?: string, ip?: string) {
  const tempToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await supabaseAdmin.from("admin_sessions").insert({
    user_id: userId,
    token: tempToken,
    expires_at: expiresAt.toISOString(),
    user_agent: userAgent ?? null,
    ip_address: ip ?? null,
    totp_pending: true,
  });

  return tempToken;
}

/** Valide le TOTP et transforme la session pending en session complète */
export async function activatePendingSession(tempToken: string) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const { data: session } = await supabaseAdmin
    .from("admin_sessions")
    .select("user_id")
    .eq("token", tempToken)
    .eq("totp_pending", true)
    .gte("expires_at", new Date().toISOString())
    .single();

  if (!session) return null;

  await supabaseAdmin
    .from("admin_sessions")
    .update({ totp_pending: false, expires_at: expiresAt.toISOString() })
    .eq("token", tempToken);

  await supabaseAdmin
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", session.user_id);

  return { token: tempToken, expiresAt };
}

export async function validateSession(token: string) {
  if (!token) return null;

  const { data: session } = await supabaseAdmin
    .from("admin_sessions")
    .select("*, admin_users(*)")
    .eq("token", token)
    .eq("totp_pending", false)
    .gte("expires_at", new Date().toISOString())
    .single();

  if (!session?.admin_users) return null;

  const user = session.admin_users as Record<string, unknown>;
  if (!user.active) return null;

  return user;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return await validateSession(token);
}

export async function hashPassword(password: string) {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return await bcrypt.compare(password, hash);
}
