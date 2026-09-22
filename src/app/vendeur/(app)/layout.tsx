import { redirect } from "next/navigation";
import { getCurrentCloser } from "@/lib/vendeur/server";
import VendeurShell from "@/components/vendeur/VendeurShell";

/** Garde d'auth pour toutes les pages du portail (sauf login). */
export default async function VendeurAppLayout({ children }: { children: React.ReactNode }) {
  const closer = await getCurrentCloser();
  if (!closer) redirect("/vendeur/login");
  return <VendeurShell closer={closer.profile}>{children}</VendeurShell>;
}
