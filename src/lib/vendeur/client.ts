import { createBrowserClient } from "@supabase/ssr";

/** Client browser du portail vendeur (clé ANON + session JWT du closer). */
export function vendeurBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
