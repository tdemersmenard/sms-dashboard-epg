import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Client serveur (server components / route handlers) — lit le JWT des cookies. */
export async function vendeurServer() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* server component read-only */ }
      },
    },
  });
}

/** Profil closer courant (ou null si pas connecté / pas closer / inactif). */
export async function getCurrentCloser() {
  const sb = await vendeurServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb.from("profiles").select("id, full_name, role, active, phone").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "closer" || !profile.active) return null;
  return { user, profile };
}
